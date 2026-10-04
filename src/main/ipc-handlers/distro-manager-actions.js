import { ipcMain } from 'electron'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export function registerWslHandlers() {
  ipcMain.handle('wsl:kill-process', async (event, pid, distroName) => {
    // we use -u root to ensure that there is no Linux permission/privilege error.
    const cmd = `wsl.exe -d ${distroName} -u root kill ${pid}`
    return await runWslCommand(cmd)
  })

  ipcMain.handle('wsl:start', async (event, distroName) => {
    // Checking whether the distro will start before opening a terminal by checking output of 'true'. This allows an error msg to propagate to the renderer.
    const stateResult = await runWslCommand(`wsl.exe -d ${distroName} -- true`, 30000) // long timeout to accommodate slow/cold startups without prematurely erroring out

    if (!stateResult.success) {
      return stateResult 
    }
    openWslInteractive(distroName)
    return { success: true }
  })

  ipcMain.handle('wsl:stop', async (event, distroName) => {
    return await runWslCommand(`wsl.exe -t ${distroName}`)
  })

  ipcMain.handle('wsl:delete', async (event, distroName) => {
    
    return await runWslCommand(`wsl.exe --unregister ${distroName}`)
  })

  ipcMain.handle('wsl:set-default', async (event, distroName) => {
    return await runWslCommand(`wsl.exe -s ${distroName}`)
  })
  ipcMain.handle('wsl:shutdown', async () => {
    return await runWslCommand(`wsl.exe --shutdown`, 10000) 
  })
}

async function runWslCommand(cmd, timeoutMs = 5000) {
  try {
    // buffering the output so it can be decoded as utf16le later - Node assumes its utf8 otherwise.
    const { stdout } = await execAsync(cmd, {
      encoding: 'buffer', 
      timeout: timeoutMs
    })

    return { success: true, output: stdout.toString('utf16le') }
  } catch (err) {

    const errorMsg = err.stdout ? err.stdout.toString('utf16le') : err.message
    return { success: false, error: errorMsg }
  }
}
async function openWslInteractive(distroName) {
  const wslCmd = `wsl.exe -d ${distroName}` 
  // using 'start' to making it explicit that a separate terminal window should open - it is not necessary. 
  spawn('cmd.exe', ['/c', 'start', '', 'cmd.exe', '/k', wslCmd], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  }).unref()
  return { success: true }
}
