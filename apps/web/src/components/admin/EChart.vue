<script setup>
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { LabelLayout } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'

/**
 * ECharts 按需注册封装（t13）：只打包用到的图表/组件，控制体积。
 * 主题无关：颜色全部由 option 显式给出（遵循平台无彩色 + 状态语义色边界）。
 */
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  LabelLayout,
  CanvasRenderer,
])

const props = defineProps({
  /** ECharts option（父组件负责按需构造；变更时 notMerge 整体替换） */
  option: { type: Object, required: true },
  height: { type: String, default: '300px' },
  loading: { type: Boolean, default: false },
})

const el = ref(null)
const chart = shallowRef(null)
let observer = null

function render() {
  if (!chart.value || !props.option) return
  chart.value.setOption(props.option, { notMerge: true })
}

function applyLoading() {
  if (!chart.value) return
  if (props.loading) {
    chart.value.showLoading({ text: '', color: '#737373', maskColor: 'rgba(255,255,255,0.6)' })
  } else {
    chart.value.hideLoading()
  }
}

watch(() => props.option, render, { deep: true })
watch(() => props.loading, applyLoading)

onMounted(() => {
  if (!el.value) return
  chart.value = echarts.init(el.value)
  applyLoading()
  render()
  observer = new ResizeObserver(() => chart.value?.resize())
  observer.observe(el.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  chart.value?.dispose()
  chart.value = null
})
</script>

<template>
  <div ref="el" :style="{ height }" class="w-full min-w-0" role="img" aria-label="数据图表" />
</template>
