import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)



export async function getWslInfo() {
  try {
    const { stdout: rawList } = await execAsync('wsl.exe -l -v', {
      env: { ...process.env, WSL_UTF8: '1' } // Forces UTF-8 output
})
    // Skip header
    const lines = rawList.split('\n').slice(1)
    const distros = []

    for (const line of lines) {
      // Split on multiple spaces to get [Name, State, Version]
      const cleaned = line.replace(/^\s*\*\s*/, '').trim() // Remove leading spaces and '*' - fixes a bug where the default distro is not seen by WslMonitor.
      const parts = cleaned.split(/\s{2,}/) // split by 2 or more whitespaces because distronames can contain a space
      if (parts.length < 2) continue

      const name = parts[0]
      const status = parts[1].toLowerCase() 

      //  Get Disk Size for a specific distro
      let diskSize = 'N/A'
      if (status === 'running') {
        try {
          const dfCmd = `wsl.exe --system -d ${name} df -H /mnt/wslg/distro` // command taken from https://learn.microsoft.com/en-us/windows/wsl/disk-space
          const { stdout: dfOut } = await execAsync(dfCmd)
          const dfLines = dfOut.trim().split('\n')
          if (dfLines.length >= 2) {
            // Index 2 is "Used"  in 'df -h' output
            diskSize = dfLines[1].trim().split(/\s+/)[2]
            diskSize += 'B' // Append "B" for bytes, since df -H uses powers of 1000 (not xibibytes)
          }
        } catch (e) {
          console.warn(`Could not get size for ${name}:`, e.message)
        }
      }

      distros.push({
        id: name, // Using name as ID
        name,
        status,
        diskSize
      })
    }

    return distros
  } catch (error) {
    console.error('WSL Distro Fetch Failed:', error)
    return []
  }
}
