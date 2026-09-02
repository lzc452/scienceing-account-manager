<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({ class: { type: [String, Object, Array], default: undefined } })
</script>

<template>
  <div :class="cn('rounded-3xl bg-paper shadow-subtle', props.class)">
    <slot />
  </div>
</template>
