<script setup>
import { ref, onMounted, computed, watch, onActivated, onDeactivated, onUnmounted } from 'vue'
import { distros } from './../store/distroStore'

defineOptions({ name: 'Processes' })

const headers = [
  { title: 'Name', key: 'name', align: 'start', width: '40%', minWidth: '200px' },
  { title: 'CPU %', key: 'cpu', width: '15%', align: 'end' },
  { title: 'Mem %', key: 'mem', width: '15%', align: 'end' },
  { title: 'PID', key: 'pid', width: '10%', align: 'center' },
  { title: 'User', key: 'user', width: '120px', align: 'start' },
  { title: 'Status', key: 'status', width: '10%', align: 'center' }
]
// making the UI table headers reactive to the view mode, so sorting can be disabled in tree mode.
const computedHeaders = computed(() => {
  return headers.map((header) => {
    return {
      ...header,
      sortable: viewMode.value === 'top'
    }
  })
})
const processes = ref([])
const selectedDistroName = ref(null)
const selectedProcessId = ref(null)
const expandedProcesses = ref([1])
const viewMode = ref('top')
let pollingInterval = null

const fetchProcesses = async () => {
  try {
    const data = await window.api.GetProcesses()
    processes.value = data || []

    // Only auto-select if nothing is chosen yet
    if (!selectedDistroName.value && data?.length > 0) {
      selectedDistroName.value = data[0].distroName
    }
  } catch (err) {
    console.error('WSL Fetch Error:', err)
    processes.value = []
  }
}

// Robust polling: prevents multiple intervals from stacking
const startPolling = () => {
  if (pollingInterval) return
  fetchProcesses()
  pollingInterval = setInterval(fetchProcesses, 2000)
}

const stopPolling = () => {
  clearInterval(pollingInterval)
  pollingInterval = null
}

onActivated(startPolling)
onDeactivated(stopPolling)
onMounted(startPolling)
onUnmounted(stopPolling)

function selectDistro(distro) {
  selectedDistroName.value = distro.name
  expandedProcesses.value = [1]
}
// Filters the full process list down to just the ones for the currently selected distro. This is the base dataset, an array of objects/processes.
const currentDistroProcesses = computed(() => {
  if (!selectedDistroName.value) return []
  return processes.value.filter((p) => p.distroName === selectedDistroName.value)
})


const tableItems = computed(() => {
  const raw = currentDistroProcesses.value

  // in "Top" mode, sort by CPU and Memory, no hierarchy
  if (viewMode.value === 'top') {
    return [...raw]
      .sort((a, b) => b.cpu - a.cpu || b.mem - a.mem)
      .map((p) => ({ ...p, displayLevel: 0 }))
  }

  // its 'Tree' mode if we reach here.
  const tree = []
  const allPids = new Set(raw.map((p) => p.pid)) // convert to hashset for quick lookup

  // First, find the top-Level Nodes
  /*
    A node belongs at the top level of our UI if its parent process does not exist in the current snapshot of the data. 
    We catch two completely different scenarios using one check for topLevelNodes:
    
    1. The 'init' process (Pid 1): Its parent is PID 0 (the kernel), which isn't in the raw list as it is not collected by ps.
    2. Orphaned processes: A process becomes orphaned if its parent exits or crashes. The orphan still exists, 
       but its parentPid points gets reassigned to the init process. However, because our app takes a snapshot every 2 seconds,
       there is a race condition where we might fetch the data right after the parent dies, but before the OS 
       finishes re-assigning the child to PID 1.
       
    If we strictly filtered for a parent chain, these orphans would completely disappear from the UI tree. 
    By checking if the parentPid is missing from the dataset entirely (!allPids.has), we retrieve 
    these orphans and promote them to the top level of the UI tree (next to Pid 1) so they remain visible to the user.
  */
  let topLevelNodes = raw.filter((p) => !allPids.has(p.parentPid))

  // Make the top level alphabetical (UX choice)
  topLevelNodes.sort((a, b) => a.name.localeCompare(b.name))

  // Helper function to define the recursive branch builder
  const buildBranch = (parentNode, level) => {
    // Add the current parent to the final UI list.
    // We use displayLevel so the tree can be mathematically flat for the Vuetify data-table to render,
    // while still visually indenting the rows.
    tree.push({ ...parentNode, displayLevel: level })

    // Lazy Loading - Only spend CPU cycles searching for children if the user actually expanded the row.
    if (expandedProcesses.value.includes(parentNode.pid)) {
      // Find direct children of the current node
      let children = raw.filter((p) => p.parentPid === parentNode.pid)
      children.sort((a, b) => a.name.localeCompare(b.name))

      // Recursively build out the deeper branches
      children.forEach((child) => {
        buildBranch(child, level + 1)
      })
    }
  }

  topLevelNodes.forEach((node) => {
    buildBranch(node, 0)
  })

  return tree
})
const hasChildren = (pid) => currentDistroProcesses.value.some((p) => p.parentPid === pid)

// Watch for CPU-intensive processes to auto-expand their location in the tree
watch(
  currentDistroProcesses,
  (newList) => {
    if (viewMode.value !== 'tree') return

    newList.forEach((p) => {
      if (p.cpu >= 1.0) {
        let current = p
        let guard = 0 // prevent infinite loops
        while (current && current.parentPid > 1 && guard < 10) {
          if (!expandedProcesses.value.includes(current.parentPid)) {
            expandedProcesses.value.push(current.parentPid)
          }
          // Use a lookup map for the crawl up the tree
          current = pidLookup.value.get(current.parentPid)
          guard++
        }
      }
    })
  },
  { deep: true }
)

const pidLookup = computed(() => {
  const map = new Map()
  currentDistroProcesses.value.forEach((p) => map.set(p.pid, p))
  return map
})

const getStatusColor = (stat) => {
  if (!stat) return 'info'
  const s = stat.toUpperCase()
  if (s.includes('R')) return 'success' // Running
  if (s.includes('Z')) return 'error' // Zombie
  if (s.includes('S')) return 'grey' // Sleeping
  return 'info'
}

const handleRowClick = (event, { item }) => {
  selectedProcessId.value = item.pid
}

const toggleChildren = (pid) => {
  const idx = expandedProcesses.value.indexOf(pid)
  idx > -1 ? expandedProcesses.value.splice(idx, 1) : expandedProcesses.value.push(pid)
}

const selectedProcess = computed(() => {
  if (!selectedProcessId.value) return null
  return currentDistroProcesses.value.find((p) => p.pid === selectedProcessId.value)
})

const canKillSelected = computed(() => {
  if (!selectedProcess.value) return false

  const pUser = selectedProcess.value.user
  const cUser = selectedProcess.value.currentUser

  // Exact match (for usernames with 8 characters or less)
  if (pUser === cUser) return true

  // Truncated match (for long usernames)
  // If ps says "isaubun+", we strip the "+" and check if "isaubuntu" starts with "isaubun"
  if (pUser.endsWith('+')) {
    const strippedName = pUser.slice(0, -1)
    return cUser.startsWith(strippedName)
  }
  return false
})


const killProcess = async () => {
  if (!selectedProcessId.value) return 
  try {
    await window.api.KillProcess(selectedProcessId.value, selectedDistroName.value)

    selectedProcessId.value = null
    fetchProcesses()
  } catch (err) {
    console.error('Failed to kill process:', err)
  }
}
</script>

<template>
  <v-container fluid class="pa-0 fill-height d-flex flex-column flex-grow-1">
    <v-card
      class="d-flex flex-column w-100 flex-grow-1 rounded-ts-xl rounded-0 elevation-24 glass-card overflow-hidden"
      flat
      transparent
    >
      <!-- toolbar / header row -->
      <v-toolbar color="transparent" density="compact" class="border-b px-4 flex-shrink-0">
        <span class="text-subtitle-1 font-weight-bold">
          Process View ({{ tableItems.length }} shown)
        </span>
        <v-spacer />

        <v-btn-toggle v-model="viewMode" mandatory class="mr-4" density="compact">
          <v-btn value="top" prepend-icon="mdi-format-list-numbered">Top</v-btn>
          <v-btn value="tree" prepend-icon="mdi-file-tree">Tree</v-btn>
        </v-btn-toggle>

        <div class="d-flex ga-2 align-center">
          <span
            class="d-inline-block"
            :title="
              selectedProcess && !canKillSelected
                ? `Cannot terminate processes owned by ${selectedProcess.user}. You are logged in as ${selectedProcess.currentUser}.`
                : ''
            "
          >
            <v-btn
              icon="mdi-stop"
              size="medium"
              variant="flat"
              :color="canKillSelected ? 'error' : 'grey-darken-3'"
              :disabled="!canKillSelected"
              @click="killProcess"
            ></v-btn>
          </span>
          <v-chip v-if="viewMode === 'tree'" size="small" color="info">
            {{ expandedProcesses.length }} expanded
          </v-chip>
        </div>
      </v-toolbar>

      <v-layout class="flex-grow-1">
        <!-- sidebar -->
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
              @click="selectDistro(distro)"
              rounded="lg"
              class="mb-1"
            >
              <v-list-item-title class="text-body-2 font-weight-medium">
                {{ distro.name }}
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-navigation-drawer>

        <!-- main table area -->
        <v-main class="d-flex flex-column flex-grow-1">
          <v-card-text class="flex-grow-1 pa-0 h-0 overflow-hidden">
            <v-data-table
              :headers="computedHeaders"
              :items="tableItems"
              :items-per-page="-1"
              class="fill-height table-transparent"
              fixed-header
              density="compact"
              hide-default-footer
              theme="dark"
              height="100%"
              hover
              :custom-sort="(items) => items"
              :sort-by="[]"
              :must-sort="false"
              :row-props="
                (data) => ({
                  class: {
                    'selected-row': data.item.pid === selectedProcessId
                  }
                })
              "
              @click:row="handleRowClick"
            >
              <template #item.name="{ item }">
                <div
                  class="d-flex align-center"
                  :title="item.fullCmd"
                  :style="{
                    paddingLeft: viewMode === 'tree' ? `${item.displayLevel * 20}px` : '0px',
                    overflow: 'hidden'
                  }"
                >
                  <v-icon
                    v-if="viewMode === 'tree' && hasChildren(item.pid)"
                    :color="expandedProcesses.includes(item.pid) ? 'primary' : 'grey'"
                    size="x-small"
                    @click.stop="toggleChildren(item.pid)"
                    class="mr-2 flex-shrink-0 cursor-pointer"
                  >
                    {{
                      expandedProcesses.includes(item.pid)
                        ? 'mdi-chevron-down'
                        : 'mdi-chevron-right'
                    }}
                  </v-icon>

                  <strong v-if="!item.parentPid || viewMode === 'top'" class="text-truncate">
                    {{ item.name }}
                  </strong>
                  <span v-else class="text-truncate">{{ item.name }}</span>
                </div>
              </template>

              <template #item.pid="{ item }">
                <span class="font-mono text-caption text-grey">{{ item.pid }}</span>
              </template>

              <template #item.cpu="{ item }">
                <v-progress-linear
                  :model-value="item.cpu"
                  height="14"
                  density="compact"
                  color="warning"
                  class="rounded-pill"
                  style="width: 100%"
                />
                <span class="text-caption ml-1">{{ item.cpu.toFixed(1) }}%</span>
              </template>

              <template #item.mem="{ item }">
                <v-progress-linear
                  :model-value="item.mem"
                  height="14"
                  density="compact"
                  color="primary"
                  class="rounded-pill"
                  style="width: 100%"
                />
                <span class="text-caption ml-1">{{ item.mem.toFixed(1) }}%</span>
              </template>

              <template #item.status="{ item }">
                <v-chip :color="getStatusColor(item.status)" size="x-small" label>
                  {{ item.status }}
                </v-chip>
              </template>
            </v-data-table>
          </v-card-text>

          <v-divider />

          <v-card-actions class="px-6 py-1 bg-transparent">
            <span class="text-caption text-grey-lighten-1">
              Live updates every 2s •
              {{
                viewMode === 'top'
                  ? 'Showing highest CPU processes'
                  : 'Auto-expanding high CPU processes'
              }}
            </span>
          </v-card-actions>
        </v-main>
      </v-layout>
    </v-card>
  </v-container>
</template>

<style scoped>
.glass-card {
  background: rgba(29, 29, 29, 0.514) !important;
  backdrop-filter: blur(15px) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

.table-transparent {
  background: transparent !important;
}

.font-mono {
  font-family: 'Roboto Mono', monospace;
}

.selected-row {
  background-color: rgba(255, 255, 255, 0.12) !important;
}

.cursor-pointer {
  cursor: pointer !important;
}

.cursor-pointer:hover {
  opacity: 0.7;
}
</style>
