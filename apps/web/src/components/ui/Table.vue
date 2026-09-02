<script setup>
import { cn } from '@/lib/utils'

/**
 * 表格容器
 *
 * 响应式（本次优化）：
 * - 外层 .table-scroll 把横向溢出严格限制在卡片内部，页面本身永不出现横向滚动条；
 * - min-w 通过 prop 传入，让各页面按列数声明「舒适最小宽度」：宽于它时列宽自适应，
 *   窄于它时表格内部滚动，而不是把单元格压成一团。
 */
const props = defineProps({
  class: { type: [String, Object, Array], default: undefined },
  /** 表格舒适最小宽度（Tailwind 类，如 'min-w-[720px]'） */
  minWidth: { type: String, default: '' },
})
</script>

<template>
  <div class="table-scroll">
    <table :class="cn('w-full caption-bottom text-sm', props.minWidth, props.class)">
      <slot />
    </table>
  </div>
</template>
