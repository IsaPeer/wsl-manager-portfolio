<script setup>
import { ref, watch, computed, onMounted } from 'vue' 
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { wslFrame } from '../store/wslMonitorStore'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent])

const props = defineProps({
  distroName: { type: String, default: null },
  points: { type: Number, default: 60 }
})

// contains chart data for all distros, keyed by name
const history = ref({})

function getBucket(name) {
  return (history.value[name] ??= { labels: [], cpu: [], ram: [] })
}

function pushPoint(bucket, stats, timestamp = null) {
  const dateObj = timestamp ? new Date(timestamp) : new Date()
  const stamp = dateObj.toLocaleTimeString()

  const cpuPct = stats.cpu_percent ?? 0
  const ramPct = stats.ram_percent ?? 0

  bucket.labels.push(stamp)
  
  bucket.cpu.push(Number(cpuPct.toFixed(2)))
  bucket.ram.push(Number(ramPct.toFixed(2)))

  const max = props.points
  if (bucket.labels.length > max) {
    bucket.labels.shift()
    bucket.cpu.shift()
    bucket.ram.shift()
  }
}


function processFrame(frame) {
  if (!frame) return
  const ts = frame.timestamp || Date.now()

  Object.keys(frame).forEach(key => {
    if (key === 'timestamp') return

    const stats = frame[key]
    if (stats) {
      // If unresponsive/lagging, push 0s and let the graph drop
      if (stats.status === 'unresponsive' || stats.status === 'lag') {
        pushPoint(getBucket(key), { cpu_percent: 0, ram_percent: 0 }, ts)
      } else {
        pushPoint(getBucket(key), stats, ts)
      }
    }
  })
}

// Load History from main process
onMounted(async () => {
  try {
    const pastFrames = await window.api.getHistory() 
    if (Array.isArray(pastFrames)) {
      pastFrames.forEach(frame => processFrame(frame))
    }
  } catch (e) {
    console.error("Failed to load history:", e)
  }
})


watch(wslFrame, (frame) => {
  processFrame(frame)
})

// use the selected distro's chart data
const activeBucket = computed(() => {
  const name = props.distroName
  if (!name) return { labels: [], cpu: [], ram: [] }
  return getBucket(name)
})
// adapted from https://vue-echarts.dev/#codegen
const chartOption = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { 
    trigger: 'axis',
  },
  legend: {
    data: ['CPU Utilisation', 'Process Memory'],
    textStyle: { color: '#ccc' },
    top: 10
  },
  grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: activeBucket.value.labels,
    axisLine: { lineStyle: { color: '#555' } },
    axisLabel: { color: '#c7c7c7' }
  },
  yAxis: {
    type: 'value',
    name: 'Usage %',
    min: 0,
    max: 100,
    splitLine: { lineStyle: { color: '#333', type: 'dashed' } },
    axisLabel: { formatter: '{value}%', color: '#c7c7c7' },
    nameTextStyle: { color: '#b0b0b0 ' },



  },
  series: [
    {
      name: 'CPU Utilisation',
      type: 'line',
      smooth: true,
      data: activeBucket.value.cpu,
      areaStyle: { opacity: 0.1 },
      itemStyle: { color: '#42a5f5' },
      symbol: 'none' 
    },
    {
      name: 'Process Memory',
      type: 'line',
      smooth: true,
      data: activeBucket.value.ram,
      areaStyle: { opacity: 0.1 },
      itemStyle: { color: '#ab47bc' },
      symbol: 'none'
    }
  ]
}))
</script>

<template>
  <div class="chart-wrap">
    <VChart class="chart" :option="chartOption" autoresize />
  </div>
</template>

<style scoped>
.chart-wrap {
  flex: 1 1 auto;
  min-height: 100px;
}
.chart {
  width: 100%; 
  height: 100%;
}
</style>
