import { ref, watch, computed } from 'vue'

export const wslFrame = ref({})
// global store of every distros current state used by the pop-up notifications and wslMonitor
const distroStats = ref({})

// Suppress lag warnings when user is intentionally shutting down wsl.
export const isShuttingDown = ref(false)

// Stats for a single distro - fallbacks are for when data hasn't arrived yet
export const getDistroStats = (distroName) =>
  computed(() => {
    return distroStats.value[distroName] || { swapMb: 0, ramPct: 0, uptime: 0, status: 'healthy' }
  })

// Used by the title bar warning.
export const isSystemLagging = computed(() => {
  if (isShuttingDown.value) return false
  
  const distros = Object.values(distroStats.value)
  return distros.some(s => s.status === 'lag' || s.status === 'unresponsive')
})

// Used by the full-screen overlay when every active distro is struggling.
export const allDistrosLagging = computed(() => {
  if (isShuttingDown.value) return false

  const distros = Object.values(distroStats.value)
  if (distros.length === 0) return false
  return distros.every(s => s.status === 'lag' || s.status === 'unresponsive')
})

// Distros currently shown in the warning cards.
export const strugglingDistros = computed(() => {
  if (isShuttingDown.value) return []

  return Object.entries(distroStats.value)
    .filter(([_, stats]) => stats.status === 'lag' || stats.status === 'unresponsive')
    .map(([name, stats]) => ({
      name,
      status: stats.status
    }))
})

watch(
  wslFrame,
  (frame) => {
    const now = Date.now()
    const incomingDistros = Object.keys(frame || {}).filter(k => k !== 'timestamp')

    // Remove distros that no longer appear in the latest frame so the pop-up warnings are not affected.
    Object.keys(distroStats.value).forEach((d) => {
      if (!incomingDistros.includes(d)) {
        delete distroStats.value[d]
      }
    })

    Object.entries(frame || {}).forEach(([distro, stats]) => {
      if (distro === 'timestamp') return

      distroStats.value[distro] = {
        swapMb: Math.round(stats.swap_mb || 0),
        ramPct: Math.round(stats.ram_percent || 0),
        uptime: stats.uptime_seconds || 0,
        cores: stats.cores || 0,
        totalRamMb: Math.round(stats.total_ram_mb || 0),
        status: stats.status || 'healthy', 
        lastUpdated: frame.timestamp || now,
        isStale: stats.status === 'lag' || (now - (frame.timestamp || now) > 3000)
      }
    })
  },
  { immediate: true, deep: true }
)

export { distroStats }
