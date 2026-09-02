<script setup>
import { cn } from '@/lib/utils'

/**
 * Stat Block（DESIGN.md）：label 12px/500 #737373 + value 36px/600 #0a0a0a tabular。
 * 纯排版层级，不使用卡片包裹。
 */
const props = defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  /** 值旁可选状态圆点（池统计用语义色，仅状态标签元素） */
  dot: { type: String, default: undefined },
  hint: { type: String, default: undefined },
  class: { type: [String, Object, Array], default: undefined },
})
</script>

<template>
  <div :class="cn('flex flex-col gap-1', props.class)">
    <span class="text-xs font-medium leading-none text-mid-gray">{{ label }}</span>
    <!--
      数值字号随断点递进（28 → 32 → 36px）：小屏不因超大字号挤压同行指标，
      大屏保留设计稿 36px/600 的分量感。
    -->
    <span
      class="flex items-center gap-2 text-[28px] font-semibold leading-none tracking-[-0.025em] text-ink tabular-nums sm:text-[32px] lg:text-[36px]"
    >
      <span
        v-if="dot"
        class="size-2.5 shrink-0 rounded-full"
        :style="{ backgroundColor: dot }"
        aria-hidden="true"
      />
      {{ value }}
    </span>
    <span v-if="hint" class="text-sm leading-5 text-mid-gray">{{ hint }}</span>
  </div>
</template>
