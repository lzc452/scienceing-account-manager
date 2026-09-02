<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({ class: { type: [String, Object, Array], default: undefined } })
</script>

<template>
  <div :class="cn('animate-skeleton rounded-2xl bg-canvas', props.class)" />
</template>
