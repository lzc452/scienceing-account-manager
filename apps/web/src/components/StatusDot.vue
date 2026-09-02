<script setup>
import { computed } from 'vue'
import { STATUS_META } from '@/lib/status'
import { cn } from '@/lib/utils'

/**
 * 状态圆点 + 文本（§4.1）。
 * 文本是语义主通道（灰度滤镜下仍可读）；圆点是强化通道。
 * 回收中 = 琥珀空心 + ¾ 弧 SVG 旋转（2s/圈，prefers-reduced-motion 时静止）。
 */
const props = defineProps({
  status: { type: String, required: true },
  label: { type: String, default: undefined },
  class: { type: [String, Object, Array], default: undefined },
})

const meta = computed(() => STATUS_META[props.status] ?? STATUS_META.released)
const text = computed(() => props.label ?? meta.value.label)
</script>

<template>
  <span
    role="status"
    :aria-label="text"
    :class="cn('inline-flex select-none items-center gap-1.5 align-middle', props.class)"
  >
    <span class="relative inline-flex size-2 shrink-0 items-center justify-center" aria-hidden="true">
      <!-- 实心圆点（可用 / 使用中 / 异常） -->
      <span
        v-if="!meta.hollow"
        class="size-2 rounded-full"
        :style="{ backgroundColor: meta.dot }"
      />

      <!-- 回收中：空心 + ¾ 弧旋转 -->
      <svg v-else-if="meta.spin" class="status-dot-spin size-2.5" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="4" :stroke="meta.dot" stroke-opacity="0.25" stroke-width="1.5" />
        <circle
          cx="6"
          cy="6"
          r="4"
          :stroke="meta.dot"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-dasharray="18.85 6.28"
        />
      </svg>

      <!-- 已释放：空心灰圈（静态） -->
      <span v-else class="size-2 rounded-full border" :style="{ borderColor: meta.dot }" />
    </span>

    <span class="text-xs font-medium leading-none text-mid-gray">{{ text }}</span>
  </span>
</template>
