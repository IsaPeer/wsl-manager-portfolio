// APIs for renderer
const { contextBridge, ipcRenderer } = require('electron');
const api = {
  getWSLData: () => ipcRenderer.invoke('wsl:get-data'), 
  startDistro: (name) => ipcRenderer.invoke('wsl:start', name),
  stopDistro: (name) => ipcRenderer.invoke('wsl:stop', name),
  deleteDistro: (name) => ipcRenderer.invoke('wsl:delete', name),
  setDefaultDistro: (name) => ipcRenderer.invoke('wsl:set-default', name),
  shutdownWsl: () => ipcRenderer.invoke('wsl:shutdown'),
    
  onWslFrame: (callback) => {
    const handler = (_event, frame) => callback(frame)
    ipcRenderer.on('wsl:frame', handler)
    return () => ipcRenderer.removeListener('wsl:frame', handler)  
},
  
  getHistory: () => ipcRenderer.invoke('wsl:get-history'),
  GetProcesses: () => ipcRenderer.invoke('py:get-wsl-processes'),

  KillProcess: (pid, distroName) => ipcRenderer.invoke('wsl:kill-process', pid, distroName)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    // contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // window.electron = electronAPI
  window.api = api
}
