# returns jsonified output from wsl.exe -d {distro_name} -u root ps -e ww -o pid,ppid,user,pcpu,pmem,stat,comm
import subprocess
import json
# import psutil
import os
startupinfo = subprocess.STARTUPINFO()
startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
startupinfo.wShowWindow = subprocess.SW_HIDE

def get_running_distros():
    try:
        result = subprocess.run(
            ["wsl.exe", "--list", "--running", "--quiet"], 
            capture_output=True, text=True, encoding='utf-16-le',
            startupinfo=startupinfo, timeout=5
        )
        return [line.strip() for line in result.stdout.splitlines() if line.strip()]
    except Exception:
        return []
    
def get_wsl_processes():
    """
    The main engine: Connects to each running distro and scrapes the 'ps' table.
    Using 'args' instead of 'comm' to get the full path for the tooltips.
    """
    processes = []
    
    # Get all WSL distros
    distro_names = get_running_distros()
    for distro_name in distro_names: 
        
        
        try:
            # get current user so the front end knows which processes it is allowed to kill (can't kill root or other system owned processes)
            
            who_cmd = ["wsl.exe", "-d", distro_name, "--exec", "whoami"]
            who_res = subprocess.run(who_cmd, capture_output=True, text=True, encoding='utf-8', startupinfo=startupinfo, timeout=2)
            current_user = who_res.stdout.strip()
        except Exception:
            current_user = "" 
            
        cmd = ["wsl.exe", "-d", distro_name, "-u", "root", "ps", "-e", "ww", "-o", "pid,ppid,user,pcpu,pmem,stat,args"]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', timeout=2)
            lines = result.stdout.strip().split('\n')
            
            # Skip lines[0] - it's the table header
            for line in lines[1:]:
                line = line.strip()
                if not line: continue
                
                # Split by whitespace, but only for the first 6 columns. 
                # The 7th column (args) can contain spaces, so we leave it intact.
                parts = line.split(None, 6)
                
                if len(parts) == 7:
                    
                    full_args = parts[6].strip()
                    
                    # Skip the ps command itself so this doesn't show in the output.
                    if full_args.startswith("ps "): continue 
                    
                    # format "/usr/bin/python3" into just "python3" for the UI tree but keep the full path for the tooltip.
                    short_name = full_args.split()[0].split('/')[-1]

                    processes.append({
                        "distroName": distro_name,
                        "currentUser": current_user,
                        "pid": int(parts[0]),
                        "parentPid": int(parts[1]) if parts[1] != '0' else None,
                        "user": parts[2],
                        "cpu": float(parts[3]),
                        "mem": float(parts[4]),
                        "status": parts[5],
                        "name": short_name,     # UI displays this
                        "fullCmd": full_args    # Tooltip displays this
                    })
                    
           

        except Exception as e:
            # skip any distro that fails to respond
            pass 
    return processes
if __name__ == "__main__":
    processes = get_wsl_processes()
    print(json.dumps(processes, indent=2))

