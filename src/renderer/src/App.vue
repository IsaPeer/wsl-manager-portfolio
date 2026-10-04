<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import DistroManager from './views/DistroManager.vue'
import WslMonitor from './views/WslMonitor.vue'
import {
  isShuttingDown,
  wslFrame,
  allDistrosLagging,
  isSystemLagging,
  strugglingDistros
} from './store/wslMonitorStore.js'
import Processes from './views/Processes.vue'
import { startDistroPolling, refreshDistros } from './store/distroStore.js'

const handleStop = async (distroName) => {
  if (!distroName) return
  const result = await window.api.stopDistro(distroName)

  if (result.success) {
    await refreshDistros()
  } else {
    alert(`Error stopping distro: ${result.error}`)
  }
}

let removeListener

onMounted(() => {
  removeListener = window.api.onWslFrame((frame) => {
    wslFrame.value = frame
  })

  // Start polling distros globally
  startDistroPolling()
})
const handleShutdown = async () => {
  const ok = window.confirm('This will force-close all Linux apps and reset the WSL VM. Continue?')

  if (ok) {
    isShuttingDown.value = true
    const oldFrame = wslFrame.value
    wslFrame.value = {}

    try {
      const result = await window.api.shutdownWsl()

      if (result.success) {
        await refreshDistros()
        // Sorts out bug with warning popup showing up after shutting down wsl
        setTimeout(() => {
          isShuttingDown.value = false
        }, 35000)
      } else {
        alert(`Error: ${result.error}`)

        setTimeout(() => {
          isShuttingDown.value = false
          wslFrame.value = oldFrame // Restore the error state
        }, 2000)
      }
    } catch (err) {
      alert(`Error: ${err.message || err}`)
      isShuttingDown.value = false
      wslFrame.value = oldFrame
    }
  }
}
onUnmounted(() => {
  removeListener?.()
})

// Navigation State
const activeView = ref('manager')
const drawer = ref(true)
const rail = ref(true)

const currentComponent = computed(() => {
  switch (activeView.value) {
    case 'manager':
      return DistroManager
    case 'monitor':
      return WslMonitor
    case 'processes':
      return Processes
    default:
      return DistroManager
  }
})

const changeView = (view) => {
  activeView.value = view
}
</script>

<template>
  <v-app
    style="
      background: linear-gradient(
        180deg,
        rgba(255, 255, 255, 0.07),
        rgba(255, 255, 255, 0.1),
        rgba(255, 255, 255, 0.2)
      );
      background-attachment: fixed;
    "
  >
    <v-layout>
      <div class="draggable-titlebar px-4 d-flex align-center">
        <span class="titlebar-text">WSL Manager</span>

        <v-fade-transition>
          <div v-if="isSystemLagging" class="ml-4 d-flex align-center">
            <v-icon size="14" color="warning" class="mr-1">mdi-clock-alert-outline</v-icon>
            <span class="text-warning" style="font-size: 10px; font-weight: bold"
              >WSL HANG DETECTED</span
            >
          </div>
        </v-fade-transition>
      </div>

      <v-navigation-drawer
        v-model="drawer"
        :rail="rail"
        width="150"
        rail-width="56"
        permanent
        app
        color="transparent"
        class="border-0"
      >
        <div style="height: 45px; min-width: 0"></div>

        <v-list nav>
          <v-list-item prepend-icon="mdi-menu" class="mb-2 text-white" @click.stop="rail = !rail" />
          <v-divider class="mb-4" />
          <v-list-item
            prepend-icon="mdi-package-variant"
            title="Manager"
            value="manager"
            :active="activeView === 'manager'"
            @click="changeView('manager')"
          />
          <v-list-item
            prepend-icon="mdi-monitor"
            title="Monitor"
            value="monitor"
            :active="activeView === 'monitor'"
            @click="changeView('monitor')"
          />
          <v-list-item
            prepend-icon="mdi-cpu-64-bit"
            title="Processes"
            value="processes"
            :active="activeView === 'processes'"
            @click="changeView('processes')"
          />
        </v-list>
      </v-navigation-drawer>

      <v-main style="height: 100vh; overflow: hidden" class="d-flex flex-column">
        <div style="height: 40px; flex: 0 0 auto"></div>
        <v-container fluid class="pa-0 flex-column flex-grow-1">
          <KeepAlive>
            <component :is="currentComponent" />
          </KeepAlive>
        </v-container>
      </v-main>

      <div
        style="
          position: fixed;
          bottom: 20px;
          left: 20px;
          z-index: 10000;
          display: flex;
          flex-direction: column-reverse;
        "
      >
        <v-fade-transition group>
          <v-card
            v-for="distro in strugglingDistros"
            :key="distro.name"
            class="glass-card mb-2 pa-4"
            width="320"
            style="border-left: 4px solid #fb8c00 !important"
          >
            <div class="d-flex justify-space-between align-center mb-1">
              <span class="text-subtitle-2 text-white font-weight-bold">{{ distro.name }}</span>
              <v-chip size="x-small" color="warning" variant="tonal" label>{{
                distro.status
              }}</v-chip>
            </div>
            <div class="text-caption text-grey-lighten-1 mb-3">
              This distro is not responding to polls. Waiting for it to recover...
            </div>
            <v-btn
              block
              size="x-small"
              :color="distro.status === 'unresponsive' ? 'error' : 'warning'"
              :variant="distro.status === 'unresponsive' ? 'flat' : 'outlined'"
              @click="handleStop(distro.name)"
            >
              {{
                distro.status === 'unresponsive' ? 'FORCE KILL DISTRO' : 'Attempt to Stop Distro'
              }}
            </v-btn>
          </v-card>
        </v-fade-transition>
      </div>

      <v-overlay
        :model-value="allDistrosLagging"
        persistent
        class="align-center justify-center"
        scrim="rgba(0,0,0,0.8)"
        style="z-index: 9998"
      >
        <v-card class="glass-card pa-8 text-center" max-width="450">
          <v-progress-circular indeterminate color="warning" size="64" width="6" class="mb-4" />
          <div class="text-h5 text-white mb-2">WSL Service Struggle</div>
          <div class="text-body-2 text-grey-lighten-1 mb-6">
            All active distributions have stopped responding. <br />
            The system is attempting to reconnect.
          </div>
          <v-btn color="error" block size="large" @click="handleShutdown">
            <v-icon start>mdi-power-cycle</v-icon>
            Shutdown WSL
          </v-btn>
        </v-card>
      </v-overlay>
    </v-layout>
  </v-app>
</template>

<style>
html,
body,
#app,
.v-application {
  height: 100vh !important;
  width: 100vw !important;
  overflow: hidden !important; /* prevents window scrolling */
}

.v-navigation-drawer--rail {
  /* Force visual width to match rail-width prop (56px) */
  width: 56px;
}

.v-main {
  flex: 1 1 auto;
}

/* let pointer events pass through the overlay */
.v-overlay__scrim {
  pointer-events: none !important;
}

.draggable-titlebar {
  display: flex;
  align-items: center;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 40px;
  app-region: drag;
  user-select: none;
  z-index: 9999; 
}

.titlebar-text {
  font-family: 'Segoe UI', sans-serif;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 400;
  pointer-events: none;
}

.selected-row td {
  background: rgba(255, 255, 255, 0.15) !important;
  color: #fff !important;
}
.glass-card {
  background: rgba(29, 29, 29, 0.514) !important;
  backdrop-filter: blur(15px) !important;
  -webkit-backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  overflow: hidden !important;
}
</style>
