import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process' 
import fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset' // default preinstalled asset
import { getWslInfo } from './utils/wsl-info.js';
import { registerWslHandlers } from './ipc-handlers/distro-manager-actions'
import { WslMonitor, defaultScriptPath } from './utils/wsl-monitor-service'

let mainWindow = null
let monitor = null

function createWindow() {
  
  mainWindow = new BrowserWindow({
    width: 960,
    height: 670,
    minWidth: 960,
    minHeight: 600,
    show: false,
    frame: false,
    contextIsolation: true,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden', 
    titleBarOverlay: {
      color: '#00000000', // fully transparent
      symbolColor: '#ffffff'
    },
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true 
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  monitor = new WslMonitor({
    scriptPath: defaultScriptPath(), 
    intervalSec: 2.5,
    timeoutSec: 1, 
    staleAfterMs: 15000
  })
  
  registerWslHandlers()
  ipcMain.handle('wsl:get-history', async () => monitor.history || [])


  ipcMain.handle('wsl:get-data', async () => { 
    return await getWslInfo();  
  });
  
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  monitor?.on('frame', (frame) => {
    // Only send if window exists and is ready
    if (mainWindow?.webContents) {
      mainWindow.webContents.send('wsl:frame', frame)
    }
  })

  monitor?.on('log', (txt) => {
    if (is.dev) console.log(String(txt).trimEnd())
  })
  
  // spawn the process capturing script
  ipcMain.handle('py:get-wsl-processes', async () => {
    const pyPath = join(__dirname, '../../src/py/processesHelper.py')
    
    if (!fs.existsSync(pyPath)) {
      console.error('PYTHON NOT FOUND:', pyPath)
      return []
    }
    
    return new Promise((resolve) => {
      const py = spawn('python', [pyPath], { shell: true });
      
      let stdout = '';
      let stderr = '';

      // prevents the process from hanging
      const timeout = setTimeout(() => {
        py.kill();
        console.error('Python processes collector script timed out');
        resolve([]);
      }, 5000);

      py.stdout.on('data', data => {
        stdout += data.toString();
      });

      py.stderr.on('data', data => {
        stderr += data.toString();
      });
      
      py.on('error', err => {
        clearTimeout(timeout);
        console.error('Failed to spawn Python:', err);
        resolve([]);
      });

      py.on('close', code => {
        clearTimeout(timeout); 
        
        if (code !== 0) {
          console.error('Python error:', stderr || `Exit code ${code}`);
          return resolve([]);
        }

        try {
          resolve(stdout.trim() ? JSON.parse(stdout) : []);
        } catch (err) {
          console.error('JSON parse failed:', err.message);
          resolve([]);
        }
      });
    }); 
  }); 
  // Start the monitor before creating the window so the WslMonitor can already start loading the data
  monitor.start()
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}) // 


// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  monitor?.stop();
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
