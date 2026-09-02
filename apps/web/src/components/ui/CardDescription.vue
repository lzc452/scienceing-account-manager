<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({ class: { type: [String, Object, Array], default: undefined } })
</script>

<template>
  <p :class="cn('text-sm text-mid-gray', props.class)">
    <slot />
  </p>
</template>
