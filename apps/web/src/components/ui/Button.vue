<script setup>
import { computed } from 'vue'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-colors active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-ink text-surface-alt hover:bg-ink-soft',
        secondary: 'bg-canvas text-ink hover:bg-surface-alt',
        outline: 'border border-hairline bg-transparent text-ink hover:bg-surface-alt',
        ghost: 'bg-transparent text-ink hover:bg-surface-alt',
        destructive: 'border border-ember bg-transparent text-ember hover:bg-status-error-soft',
        link: 'text-ink underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

const props = defineProps({
  variant: { type: String, default: 'default' },
  size: { type: String, default: 'default' },
  class: { type: [String, Object, Array], default: undefined },
})

const classes = computed(() =>
  buttonVariants({ variant: props.variant, size: props.size, class: props.class }),
)
</script>

<template>
  <button :class="classes">
    <slot />
  </button>
</template>
