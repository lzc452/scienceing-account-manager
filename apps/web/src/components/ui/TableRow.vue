<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({ class: { type: [String, Object, Array], default: undefined } })
</script>

<template>
  <tr
    :class="cn('border-b border-hairline transition-colors hover:bg-surface-alt/60', props.class)"
  >
    <slot />
  </tr>
</template>
