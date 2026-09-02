<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({ class: { type: [String, Object, Array], default: undefined } })
</script>

<template>
  <label :class="cn('text-xs font-medium leading-none text-mid-gray', props.class)">
    <slot />
  </label>
</template>
