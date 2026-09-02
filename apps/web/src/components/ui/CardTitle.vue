<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({ class: { type: [String, Object, Array], default: undefined } })
</script>

<template>
  <h3 :class="cn('text-base font-semibold leading-6 tracking-normal text-ink', props.class)">
    <slot />
  </h3>
</template>
