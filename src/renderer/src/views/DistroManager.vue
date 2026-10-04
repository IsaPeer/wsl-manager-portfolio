<script setup>
import { ref, onMounted, computed } from 'vue'
import { distros, refreshDistros } from './../store/distroStore'


const selectedRowId = ref(null)
const headers = ref([
  { title: 'Name', key: 'name' },
  { title: 'Status', key: 'status' },
  { title: 'Disk Size', key: 'diskSize' }
])
const handleRowClick = (event, { item }) => {
  // Remember which row the user last clicked on
  selectedRowId.value = item.id
}
const rowProps = (data) => {
  return {
    class: {
      // Highlight the selected row
      'selected-row': data.item.id === selectedRowId.value
    }
  }
}


const refreshHandle = async () => {
  await refreshDistros()
}

// Show the loading state only for the distro currently being started.
const startingDistroIds = ref([])
const isStarting = computed(() => startingDistroIds.value.includes(selectedRowId.value))
const handleStart = async () => {
  if (!selectedRowId.value) return

  // prevents every row getting the loading animation when the user clicks on a new row after starting a different distro.
  const targetId = selectedRowId.value
  const targetName = selectedDistro.value.name
  startingDistroIds.value.push(targetId)

  try {
    const result = await window.api.startDistro(targetName)
    
    if (result.success) {
      await refreshDistros() // Update the table
    } else {
      alert(`Error starting distro: ${result.error}`)
    }
  } finally {
    //  Remove this distro from the 'starting' 
    startingDistroIds.value = startingDistroIds.value.filter(id => id !== targetId)
  }
}


const handleStop = async () => {
  if (!selectedRowId.value) return
  const result = await window.api.stopDistro(selectedDistro.value.name)

  if (result.success) {
    await refreshDistros() 
  } else {
    alert(`Error stopping distro: ${result.error}`)
  }
}


const handleSetDefault = async () => {
  if (!selectedRowId.value) return
  const result = await window.api.setDefaultDistro(selectedDistro.value.name)

  if (result.success) {
    await refreshDistros() 
  } else {
    alert(`Error setting default distro: ${result.error}`)
  }
}
const handleDelete = async () => {
  if (!selectedRowId.value) return
  const result = await window.api.deleteDistro(selectedDistro.value.name)

  if (result.success) {
    await refreshDistros() 
  } else {
    alert(`Error deleting distro: ${result.error}`)
  }
}

// Grab the full distro object for whichever row is currently selected
const selectedDistro = computed(() => distros.value.find((d) => d.id === selectedRowId.value))

// Figure out when the Start (Play) button should be disabled
const isRunning = computed(() => selectedDistro.value?.status === 'running')

// Disable Stop button when nothing is selected or the selected distro is already stopped.
const isStopDisabled = computed(() => {
  if (!selectedRowId.value) return true 
  return selectedDistro.value?.status === 'stopped' 
})


onMounted(() => {
  refreshDistros()
})
</script>


<template>
  <v-container fluid class="pa-0 fill-height d-flex flex-column flex-grow-1 ">
    <v-card
      class="d-flex flex-column w-100 flex-grow-1 rounded-ts-xl rounded-0 elevation-24 glass-card overflow-hidden"
      flat
    >
      <v-card-title class="px-6 py-4 border-b d-flex align-center bg-transparent">
        <span class="text-h6 font-weight-bold text-white">Distributions</span>

        <!-- Spacer keeps everything that comes after it aligned to the far right -->
        <v-spacer />


        <!-- buttons -->
        <div class="d-flex ga-2 align-center">
          <v-btn
            :disabled="!selectedRowId"
            :loading="isStarting"
            variant="text"
            size="small"
            :color="isRunning ? 'info' : 'success'"
            class="text-none"
            @click="handleStart"
          >
            <v-icon start>{{ isRunning ? 'mdi-open-in-new' : 'mdi-play' }}</v-icon> 
            {{ isRunning ? 'Open' : 'Start' }}
          </v-btn>


          <v-btn
            :disabled="isStopDisabled"
            variant="text"
            size="small"
            color="error"
            class="text-none"
            @click="handleStop"
          >
            <v-icon start>mdi-stop</v-icon> Stop
          </v-btn>


          <v-btn
            variant="text"
            size="small"
            color="warning"
            class="text-none"
            @click="handleSetDefault"
          >
            <v-icon start>mdi-star</v-icon> Make Default
          </v-btn>


          <v-btn
            variant="text"
            size="small"
            color="grey-lighten-1"
            class="text-none"
            @click="handleDelete"
          >
            <v-icon start>mdi-delete</v-icon> Delete
          </v-btn>


          <!-- push Global refresh button to far right edge -->
          <v-divider vertical class="mx-2 my-2" />
          <v-btn icon="mdi-refresh" variant="text" size="small" @click="refreshHandle"></v-btn>
        </div>
      </v-card-title>


      <v-card-text class="flex-grow-1 pa-0 h-0 overflow-hidden">
        <v-data-table
          :headers="headers"
          :items="distros"
          :items-per-page="-1"
          class="fill-height table-transparent"
          fixed-header
          density="compact"
          hide-default-footer
          theme="dark"
          height="100%"
          hover
          :row-props="rowProps"
          @click:row="handleRowClick"
        >
          <template #item.status="{ item }">
            <v-chip :color="item.status === 'running' ? 'success' : 'grey'" size="x-small" label>
              {{ item.status }}
            </v-chip>
          </template>
        </v-data-table>
      </v-card-text>
      <v-divider />
      <v-card-actions class="px-6 py-1 bg-transparent" style="min-height: 32px">
        <span class="text-caption text-grey-lighten-1">{{ distros.length }} Distributions Found</span>
      </v-card-actions>
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

</style>
