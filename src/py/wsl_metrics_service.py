import subprocess
import time

import sys
import json
import argparse

import configparser
import psutil
from pathlib import Path 




def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--json", action="store_true")
    p.add_argument("--interval", type=float, default=1)
    p.add_argument("--timeout", type=float, default=0.2)
    return p.parse_args()

args = parse_args()
JSON_MODE = args.json 
POLL_INTERVAL = args.interval 
TIMEOUT_SEC = args.timeout # Max wait time per WSL call (Prevents locking up)


# Windows Startup Info (Prevents Flashing Windows) https://runebook.dev/en/docs/python/library/subprocess/subprocess.STARTUPINFO
startupinfo = subprocess.STARTUPINFO()
startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
startupinfo.wShowWindow = subprocess.SW_HIDE



def get_running_distros():
    try:
        result = subprocess.run(
            ["wsl.exe", "--list", "--running", "--quiet"], 
            capture_output=True, text=True, encoding='utf-16-le',
            startupinfo=startupinfo, timeout=TIMEOUT_SEC
        )
        return [line.strip() for line in result.stdout.splitlines() if line.strip()]
    except Exception:
        return [] # return empty array to assume that there are no running distributions.
    


# Sum utime + stime from every /proc/<pid>/stat entry to get total CPU
# time for the distro. Parse after ')' because process names can contain spaces.
def get_cpu_ticks(distro_name):
    """Return total CPU time for all processes in the distro, in clock ticks."""

    # proc/[pid]/stat fields : https://web.archive.org/web/20130302063336/http://www.lindevdoc.org/wiki//proc/pid/stat
    cmd = "cat /proc/[0-9]*/stat 2>/dev/null" 
    total_ticks = 0
    # clk_tck = 100 # setting default for if getconf fails

    try:
        result = subprocess.run(
            ["wsl.exe", "-d", distro_name, "-e", "sh", "-c", cmd],
            capture_output=True, text=True, startupinfo=startupinfo,
            timeout=TIMEOUT_SEC
        )
        if not result.stdout.strip():
            return None
        for line in result.stdout.splitlines():
            # /proc/<pid>/stat: pid (comm) state ppid ... utime stime ...
            # comm is in parentheses and may contain spaces, so can't line.split() the whole thing. 
            rparen = line.rfind(")")
            if rparen == -1:
                continue  # no ')' for some reason, skip

            relevantFields = line[rparen + 2:]  
            fields = relevantFields.split()
            if len(fields) < 13:
                continue

            try:
                # https://www.baeldung.com/linux/total-process-cpu-usage
                utime = int(fields[11])  # actually field 14 
                stime = int(fields[12])  # actually field 15 
                total_ticks += utime + stime
            except ValueError:
                continue

        
        if total_ticks == 0:
            return None   
        return total_ticks

    except subprocess.TimeoutExpired:
        return None
    except Exception:
        return 0



    
def get_global_clk_tck(targetDistro):
    # CLK_TCK is the same for all WSL distros (shared kernel).
    try:
        result = subprocess.run(
            ["wsl.exe", "-d", targetDistro, "-e", "getconf CLK_TCK"],  # run command in active distros only to not wake up WSL accidentally
            capture_output=True, text=True, startupinfo=startupinfo,
            timeout= TIMEOUT_SEC
        )
        if result.stdout.strip().isdigit():
            return int(result.stdout.strip())
    except Exception:
        pass
    return 100  # Linux/WSL default

# Returns (ram_mb, swap_mb) or (None, None) on timeout.
def get_memory_and_swap_mb(distro_name):
    """ 
    Using smaps_rollup for efficiency. It provides a summary of memory usage per process without needing to parse every smaps file which is expensive. https://tldp.org/LDP/abs/html/globbingref.html
    2>/dev/null redirects stderr to trash, suppressing permission errors from processes that can't be accessed.
    """
    cmd = "cat /proc/[0-9]*/smaps_rollup 2>/dev/null"  
    total_pss_kb = 0
    total_swap_kb = 0
    
    try:
        result = subprocess.run(
            ["wsl.exe", "-d", distro_name, "-u", "root", "-e", "sh", "-c", cmd],
            capture_output=True, text=True, startupinfo=startupinfo,
            timeout=TIMEOUT_SEC
        )

        if not result.stdout.strip():

            return None, None # Trigger the 'lag' status
        
        for line in result.stdout.splitlines():
            clean = line.strip()
            if clean.startswith("Pss:"):
                parts = clean.split()
                if len(parts) >= 2 and parts[1].isdigit():
                    total_pss_kb += int(parts[1])
            elif clean.startswith("Swap:"):
                parts = clean.split()
                if len(parts) >= 2 and parts[1].isdigit():
                    total_swap_kb += int(parts[1])
        # If we parsed stdout but found no memory data, something has gone wrong.
        if total_pss_kb == 0:
            return None, None
        return total_pss_kb / 1024, total_swap_kb / 1024
            
    except subprocess.TimeoutExpired:
        return None, None
    except Exception:
        return None, None


def get_core_count(targetDistro):
    try:
        result = subprocess.run(
            ["wsl.exe", "-d", targetDistro, "-e", "nproc", "--all"], 
            capture_output=True, text=True, startupinfo=startupinfo,
            timeout=TIMEOUT_SEC + 1
        )
        if result.returncode == 0 and result.stdout.strip().isdigit():
            return int(result.stdout.strip())
    except Exception:
        pass
    return None

def get_wsl_memory_limit_mb() -> float:
    """Return WSL memory limit in MB."""
    config_path = Path.home() / '.wslconfig'
    total_mb = psutil.virtual_memory().total / (1024**2)

    if not config_path.exists():
        return total_mb * 0.5  # WSL default

    config = configparser.ConfigParser()
    config.read(config_path)

    if 'wsl2' in config and 'memory' in config['wsl2']:
        value = config['wsl2']['memory'].strip().upper()

        try:
            if value.endswith('GB'):
                return float(value[:-2].strip()) * 1024

            if value.endswith('MB'):
                return float(value[:-2].strip())

            if value.isdigit():
                return int(value) / (1024 * 1024)
        except ValueError:
            pass

    # Default: 50% host RAM
    return total_mb * 0.5


# Called once per distro and then cached by the monitor.
def get_uptime_seconds(distro_name):
    """Returns uptime of the distro's init process in raw seconds. Only called once per distro."""
    try:
        result = subprocess.run(
            ["wsl.exe", "-d", distro_name, "-e", "ps", "-o", "etimes=", "-p", "1"],
            capture_output=True, text=True, startupinfo=startupinfo, timeout=TIMEOUT_SEC
        )
        val = result.stdout.strip()
        if val.isdigit():
            return int(val)
    except Exception:
        pass
    return 0

if __name__ == "__main__":
    if not JSON_MODE:
        print("--- Monitor Running (non json Mode) ---")
        print("Press Ctrl+C to stop.\n")
    
    prev_state = {}
    distro_boot_times = {} 
    cores = None
    clk_tck = None
    max_ram_mb = None
    consecutive_failures = {} 

    try:

        while True:
            # 1. fetch once per iteration to prevent race conditions
            
            active_distros = get_running_distros()
            curr_time_ns = time.time_ns()

            # 2. idle state - do not poll wsl if theres no active distros.
            if not active_distros:
                # Reset init so we re-check if WSL environment changes
                cores = clk_tck = max_ram_mb = None 
                prev_state.clear() 
                
                if not JSON_MODE:
                    print(f"[{time.strftime('%H:%M:%S')}] No active distros. Waiting...")
                else:
                    print(json.dumps({})) 
                    sys.stdout.flush()
                
                time.sleep(POLL_INTERVAL)
                continue

            # 3. deferred initialisation state -  get the global WSL constants.
            if cores is None:
                for d in active_distros:
                    if not JSON_MODE: print(f"Checking distro '{d}' for initialisation...")
                    cores = get_core_count(d)

                    if cores is not None:
                        #successfully got core count, so assume the distro is responsive and use it for the other global queries
                        clk_tck = get_global_clk_tck(d)
                        max_ram_mb = get_wsl_memory_limit_mb()
                        break

                # check if initialisation failed - this makes sure that the rest of the script does not continue when cores is 'None'
                if cores is None:
                    if JSON_MODE:
                        # Send a simple lag heartbeat and wait for the next POLL_INTERVAL
                        heartbeat = {d: {"status": "lag"} for d in active_distros}
                        print(json.dumps(heartbeat))
                        sys.stdout.flush()
                    
                    time.sleep(POLL_INTERVAL)
                    continue

            # initialising the output frame and printing the headers for terminal/non-json mode. 
            frame_data = {}

            if not JSON_MODE:
                print(f"\n--- Updated at {time.strftime('%H:%M:%S')} ---")
                print(f"{'DISTRO':<12} | {'CPU %':<8} | {'RAM':<10} | {'SWAP':<10}")
                print("-" * 52)



            # 4. data collection 
            for d in active_distros:
                # Initialize the failure tracker for new distros
                if d not in consecutive_failures:
                    consecutive_failures[d] = 0 # Consecutive failures is used to determine the 'health'/'status' of a distro.
                
                
                curr_ticks = get_cpu_ticks(d)
                mem_data = get_memory_and_swap_mb(d)
                
                # failure/distro-health logic
                if curr_ticks is None and mem_data[0] is None:
                    consecutive_failures[d] += 1
                    
                   # After 10 consecutive failures, mark the distro as 'unresponsive' instead of 'lag'.
                    status_type = "unresponsive" if consecutive_failures[d] >= 10 else "lag"
                    frame_data[d] = {"status": status_type}

                    if not JSON_MODE:
                        print(f"{d:<12} | {status_type.capitalize():<8} | {'...':<10} | {'...':<10}")
                    
                    # Skip the rest of the math for this distro since we have no data
                    continue
                
                # Reset failure tracker on a successful read
                consecutive_failures[d] = 0
                
                # check if the distro has restarted since last poll
                if d in prev_state and curr_ticks is not None and prev_state[d].get('ticks') is not None:
                    if curr_ticks < prev_state[d]['ticks']:
                        if d in distro_boot_times:
                            del distro_boot_times[d] 
                                                                
                # calc distro uptime
                if d not in distro_boot_times:
                    initial_uptime = get_uptime_seconds(d)
                    distro_boot_times[d] = time.monotonic() - initial_uptime
                
                current_uptime_sec = int(time.monotonic() - distro_boot_times[d])
                
                # get mem data
                if mem_data[0] is not None:
                    ram_mb, swap_mb = mem_data
                else: # try use mem data from previous data, if there is any
                    ram_mb = prev_state[d].get('ram_mb', 0.0) if d in prev_state else 0.0 
                    swap_mb = prev_state[d].get('swap_mb', 0.0) if d in prev_state else 0.0
                
                # calc cpu usage
                cpu_val = prev_state[d].get('cpu_val', 0.0) if d in prev_state else 0.0

                if d in prev_state and curr_ticks is not None and prev_state[d].get('ticks') is not None:
                    delta_ticks = curr_ticks - prev_state[d]['ticks']
                    delta_time = curr_time_ns - prev_state[d]['time']
                    
                    if delta_time > 0 and delta_ticks > 0:
                        usage_pct = (delta_ticks * 1_000_000_000 * 100) / (clk_tck * delta_time)
                        cpu_val = usage_pct / cores 

                # output
                if JSON_MODE:
                    ram_pct = round(ram_mb / max_ram_mb * 100, 2) if max_ram_mb else 0
                    frame_data[d] = {
                        "status": "healthy", # Explicitly mark as healthy when data is good
                        "cpu_percent": round(cpu_val, 2),
                        "ram_percent": ram_pct,
                        "swap_mb": round(swap_mb, 1),
                        "uptime_seconds": current_uptime_sec,
                        "cores": cores,
                        "total_ram_mb": max_ram_mb
                    }
                else:
                    print(f"{d:<12} | {cpu_val:<7.2f}% | {ram_mb:>8.1f} MB | {swap_mb:>8.1f} MB")

                # preserve state
                prev_state[d] = {
                    'ticks': curr_ticks if curr_ticks is not None else prev_state.get(d, {}).get('ticks'),
                    'time': curr_time_ns,
                    'cpu_val': cpu_val,
                    'ram_mb': ram_mb,
                    'swap_mb': swap_mb
                }

            # Remove distros from memory that are no longer running so they do not get polled and restarted unintentionally.
            for d in list(prev_state.keys()):
                if d not in active_distros:
                    del prev_state[d]
            for d in list(consecutive_failures.keys()):
                if d not in active_distros:
                    del consecutive_failures[d]
            for d in list(distro_boot_times.keys()):  
                if d not in active_distros:
                    del distro_boot_times[d]
            if JSON_MODE:
                print(json.dumps(frame_data))
                sys.stdout.flush()
                
            # if every distro is in an unhealthy state, move back to an uninitialised state state
            if frame_data and all(info.get("status") in ["lag", "unresponsive"] for info in frame_data.values()):
                if not JSON_MODE:
                    print(f"[{time.strftime('%H:%M:%S')}] RUNTIME CRASH DETECTED - Recovery mode...")
                
                cores = None 

            time.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        print("\nStopping...")
