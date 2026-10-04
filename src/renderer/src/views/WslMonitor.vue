<script setup>
import PerformanceChart from '../components/PerformanceChart.vue'
import PerformanceStatsRow from '../components/PerformanceStatsRow.vue'
import { distros } from './../store/distroStore'
import { wslFrame } from './../store/wslMonitorStore' //  monitor frame store
import { ref, computed, watch } from 'vue'
// selected distro name (what chart uses)
const selectedDistroName = ref(null)

// open first distro by default when view first opens
watch(
  distros,
  (list) => {
    if (!selectedDistroName.value && list.length > 0) {
      selectedDistroName.value = list[0].name
    }
  },
  { immediate: true }
)

// helper to see if there is data for selected distro in the latest frame
const selectedDistroData = computed(() => {
  const name = selectedDistroName.value
  if (!name) return null
  return wslFrame.value?.[name] ?? null
  
})

// true when nothing is running / no frame data
const hasAnyFrameData = computed(() => {
  const f = wslFrame.value
  return f && typeof f === 'object' && Object.keys(f).length > 0
})



function selectDistro(distro) {
  selectedDistroName.value = distro.name
}
</script>


<template>
  <v-card
    class="rounded-ts-xl rounded-0 overflow-hidden border transparent glass-card h-screen w-screen d-flex flex-column"
    elevation="24"
  >
    <!-- Header (fixed height) -->
    <v-toolbar color="transparent" density="compact" class="border-b px-2 flex-shrink-0">
      <v-icon icon="mdi-monitor-dashboard" color="primary" class="mr-2" />
      <span class="text-subtitle-1 font-weight-bold">Performance Monitor</span>
    </v-toolbar>

    <!-- Body fills remaining height -->
    <v-layout class="flex-grow-1">
      <!-- Sidebar -->
      <v-navigation-drawer permanent width="150" color="transparent" class="border-r" floating>
        <v-list density="comfortable" nav class="pa-2">
          <v-list-item-subtitle class="mb-2 pl-2 text-caption font-weight-bold text-grey">
            DISTRIBUTIONS
          </v-list-item-subtitle>

          <v-list-item
            v-for="distro in distros"
            :key="distro.id"
            :value="distro" 
            :active="distro.name === selectedDistroName"
            @click ="selectDistro(distro)"
            rounded="lg"
            class="mb-1"
          >
            <v-list-item-title class="text-body-2 font-weight-medium">
              {{ distro.name }}
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-navigation-drawer>

      <!-- Main -->
      <v-main class="d-flex flex-column flex-grow-1">
        <v-container fluid class="pb-12 d-flex flex-column flex-grow-1">
          <!-- Graph card fills remaining height -->
          <v-card class="bg-grey-darken-3 border d-flex flex-column flex-grow-1 inset" rounded="lg">
            <v-card-title class="text-subtitle-1 pt-4 pl-4 flex-shrink-0">
              CPU and Process Memory for<span class="font-weight-bold ml-1">{{ selectedDistroName }}</span>
            </v-card-title>
            <div class="text-caption text-grey px-4 pb-2 flex-shrink-0">
              Memory accounting uses per-process PSS, so it excludes kernel and cache usage.
            </div>

            <template v-if="hasAnyFrameData && selectedDistroData">
              <PerformanceChart :distro-name="selectedDistroName" />
            </template>
            <template v-else>
              <div class="d-flex flex-column align-center justify-center flex-grow-1 text-grey pa-4">
                <span class="text-h6">Distribution not detected</span>
                <span class="text-subtitle-1 mt-2">Are you sure {{ selectedDistroName }} is running?</span>
              </div>
            </template>
          </v-card>
          <KeepAlive>
            <PerformanceStatsRow v-if="hasAnyFrameData && selectedDistroData" :distro-name="selectedDistroName" :key="selectedDistroName" />
          </KeepAlive>
        </v-container>
      </v-main>
    </v-layout>
  </v-card>
</template>



<style scoped>
.glass-card {
  background: rgba(29, 29, 29, 0.514) !important;
  backdrop-filter: blur(15px) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  border-radius: 12px;
}


.inset {
  box-shadow: inset 3px -3px 6px rgba(0, 0, 0, 0.45);
}

</style>
