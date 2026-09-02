<script setup>
import { computed } from 'vue'
import { cn } from '@/lib/utils'

/**
 * 30 分钟使用进度细条（§5.3）：hairline 底 + ink 填充，纯形表达、无颜色语义。
 */
const props = defineProps({
  /** 0–100 */
  value: { type: Number, default: 0 },
  class: { type: [String, Object, Array], default: undefined },
})

const clamped = computed(() => Math.min(100, Math.max(0, props.value)))
</script>

<template>
  <div
    role="progressbar"
    :aria-valuenow="Math.round(clamped)"
    aria-valuemin="0"
    aria-valuemax="100"
    :class="cn('h-1 w-full overflow-hidden rounded-full bg-hairline', props.class)"
  >
    <div
      class="h-full rounded-full bg-ink transition-[width] duration-300"
      :style="{ width: `${clamped}%` }"
    />
  </div>
</template>
