// src/main/utils/wsl-monitor-service.js
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { EventEmitter } from 'node:events';
import path from 'node:path';

export class WslMonitor extends EventEmitter {
  constructor(options = {}) {
    super();

   
    this.python = options.python || 'python';
    this.scriptPath = options.scriptPath;
    this.intervalSec = options.intervalSec || 1.0;
    this.timeoutSec = options.timeoutSec || 0.5;
    this.staleAfterMs = options.staleAfterMs || 5000;
    this.restartDelayMs = options.restartDelayMs || 1000;

    this.child = null;
    this.rl = null;
    this.history = [];
    this.maxHistory = 600;

    this._lastFrame = {};
    this.lastFrameAt = 0;

    this.watchdogTimer = null;
    this.stopping = false;
    this.restarting = false;
  }

  get lastFrame() {
    return this._lastFrame || {};
  }

  start() {
    if (this.child) return;
    if (!this.scriptPath) throw new Error('WslMonitor: scriptPath is required');

    this.stopping = false;
    this._spawnChild();

    // Watchdog timer to check if the Python script hangs silently
    this.watchdogTimer = setInterval(() => {
      if (this.stopping) return;

      const age = Date.now() - this.lastFrameAt;
      if (this.lastFrameAt && age > this.staleAfterMs) {
        this.emit('log', `[Watchdog] Monitor stale (${age}ms), restarting...\n`);
        this._restart();
      }
    }, 1000);
  }

  stop() {
    this.stopping = true;
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    this._killChild();
  }

  _spawnChild() {
    this.lastFrameAt = Date.now();

    const args = [
      this.scriptPath,
      '--json',
      '--interval',
      String(this.intervalSec),
      '--timeout',
      String(this.timeoutSec)
    ];

    this.child = spawn(this.python, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Copying the pattern from
    // https://stackoverflow.com/questions/14332721/node-js-spawn-child-process-and-get-terminal-output-live
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk) => this.emit('log', `[Python Error] ${chunk}`));

    
    this.rl = readline.createInterface({ 
      input: this.child.stdout, 
      crlfDelay: Infinity 
    });

    this.rl.on('line', (line) => {
      const cleanLine = String(line).trim();
      if (!cleanLine) return;

      try {
        const obj = JSON.parse(cleanLine);
        
        obj.timestamp = Date.now();
        this.lastFrameAt = Date.now();
        this._lastFrame = obj;

        this.history.push(obj);
        if (this.history.length > this.maxHistory) {
          this.history.shift();
        }

        this.emit('frame', obj);
      } catch (e) {
        this.emit('log', `[Parse Error] Bad JSON received: ${cleanLine}\n`);
      }
    });

    this.child.on('exit', (code, signal) => {
      this.emit('log', `[Monitor] Exited code=${code} signal=${signal}\n`);
      this.child = null;

      if (!this.stopping) {
        this._restart();
      }
    });

    this.child.on('error', (err) => {
      this.emit('log', `[Monitor] Spawn error: ${err.message}\n`);
      if (!this.stopping) {
        this._restart();
      }
    });
  }

  _killChild() {
    // Check if objects exist before trying to close/kill them
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }

  _restart() {
    if (this.restarting || this.stopping) return;
    this.restarting = true;

    this._killChild();

    setTimeout(() => {
      this.restarting = false;
      if (!this.stopping) {
        this._spawnChild();
      }
    }, this.restartDelayMs);
  }
}

export function defaultScriptPath() {
  return path.join(process.cwd(), 'src', 'py', 'wsl_metrics_service.py');
}