<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({ class: { type: [String, Object, Array], default: undefined } })
</script>

<template>
  <caption :class="cn('mt-4 text-xs font-medium text-mid-gray', props.class)">
    <slot />
  </caption>
</template>
