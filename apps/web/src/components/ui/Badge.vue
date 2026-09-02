<script setup>
import { computed } from 'vue'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { STATUS_META } from '@/lib/status'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-2xl border px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        solid: 'border-transparent bg-ink-soft text-surface-alt',
        soft: 'border-transparent bg-canvas text-ink-soft',
        outline: 'border-hairline bg-transparent text-ink',
        'ember-outline': 'border-ember/60 bg-transparent text-ember',
      },
    },
    defaultVariants: {
      variant: 'soft',
    },
  },
)

const props = defineProps({
  /** 黑白四变体（solid / soft / outline / ember-outline） */
  variant: { type: String, default: 'soft' },
  /** 语义色 soft 变体（§4.1），设置后覆盖 variant */
  tone: { type: String, default: null },
  class: { type: [String, Object, Array], default: undefined },
})

const meta = computed(() => (props.tone ? STATUS_META[props.tone] : null))

const style = computed(() => {
  if (!meta.value) return undefined
  const m = meta.value
  return {
    backgroundColor: m.softBg,
    color: m.softText,
    // released 走 outline（透明底 + hairline 描边）
    borderColor: m.softBg === 'transparent' ? '#e5e5e5' : 'transparent',
  }
})
</script>

<template>
  <span
    :class="
      cn(
        'inline-flex items-center gap-1 rounded-2xl border px-2 py-0.5 text-xs font-medium',
        tone ? undefined : badgeVariants({ variant }),
        props.class,
      )
    "
    :style="style"
  >
    <slot>{{ meta?.label }}</slot>
  </span>
</template>
