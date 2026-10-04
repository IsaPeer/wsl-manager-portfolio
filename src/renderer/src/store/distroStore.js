import { ref } from 'vue'

// global list of WSL distros for the renderer.
export const distros = ref([])


let pollingTimer = null 

export const refreshDistros = async () => {
  try {
    const data = await window.api.getWSLData() 
    distros.value = data
  } catch (error) {
    console.error('Failed to fetch WSL distros:', error)
  }
}

// Start a single polling loop that refreshes the distro list every 3 seconds.
export const startDistroPolling = () => {
  if (pollingTimer) return; // Avoid starting a second loop.

  const poll = async () => {
    await refreshDistros(); 
    
    // Queue the next refresh after the current one finishes.
    pollingTimer = setTimeout(poll, 3000);
  }
  
  poll(); 
}

// Stop the polling loop during cleanup.
export const stopDistroPolling = () => {
  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
}
