<script setup>
import { ref, watch, computed, onMounted, onUnmounted, onActivated, onDeactivated } from 'vue'
import { getDistroStats } from '../store/wslMonitorStore.js'

const props = defineProps({
  distroName: { type: String, required: true }
})

const stats = getDistroStats(props.distroName)

// Fallbacks for when the data is loading.
const swapMb = computed(() => stats.value.swapMb || 0)
const cores = computed(() => stats.value.cores || 0)

// Convert total RAM from MB to GB for display.
const totalRamGb = computed(() => {
  const mb = stats.value.totalRamMb || 0
  return (mb / 1024).toFixed(1)
})

// Keep uptime ticking locally between monitor updates.
const localUptime = ref(0)
let timer = null

// Sync local uptime to the latest value reported by the monitor.
watch(
  () => stats.value.uptime,
  (newVal) => {
    // Treat 0 as a valid uptime (0 is falsy).
    if (typeof newVal === 'number') {
      localUptime.value = newVal
    }
  },
  { immediate: true }
)

// Format the locally ticking uptime for display.
const formattedUptime = computed(() => {
  const seconds = localUptime.value || 0

  if (seconds < 60) {
    return `${seconds}s`
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m`
})




const stopTimer = () => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

// Start the local timer when the row mounts.
onMounted(() => {
  timer = setInterval(() => {
    localUptime.value++
  }, 1000)
})
onUnmounted(stopTimer)

</script>

<template>
  <div class="stats-row mt-4 flex-shrink-0">
    <v-row dense>
      <!-- WSL resources -->
      <v-col cols="4">
        <v-card class="bg-grey-darken-3 border pa-3 inset" rounded="lg">
          <div class="text-caption text-grey">WSL Allocated Resources</div>
          <div class="text-h4 font-weight-bold mt-1">
            {{ cores }}<span class="text-body-1 ml-1 mr-2">Cores</span>
            <span class="text-body-1 text-grey-darken-1 mr-2">/</span>
            {{ totalRamGb }}<span class="text-body-1 ml-1">GB</span>
          </div>
        </v-card>
      </v-col>

      <!-- Uptime -->
      <v-col cols="4">
        <v-card class="bg-grey-darken-3 border pa-3 inset" rounded="lg">
          <div class="text-caption text-grey">Distro Uptime</div>
          <div class="text-h4 font-weight-bold mt-1">
            {{ formattedUptime }}
          </div>
        </v-card>
      </v-col>

      <v-col cols="4">
        <v-card class="bg-grey-darken-3 border pa-3 inset" rounded="lg">
          <div class="text-caption text-grey">Swap Usage (MB)</div>
          <div class="text-h4 font-weight-bold mt-1">
            {{ swapMb }}<span class="text-body-1">MB</span>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<style scoped>
/* Hide the stats row when the window is short. */
@media (max-height: 600px) {
  .stats-row {
    display: none;
  }
}

.inset {
  box-shadow: inset 3px -3px 6px rgba(0, 0, 0, 0.45);
}
</style>
