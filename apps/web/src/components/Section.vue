<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({
  title: { type: String, required: true },
  class: { type: [String, Object, Array], default: undefined },
})
</script>

<template>
  <section :class="cn('mt-10 first:mt-0', props.class)">
    <h2 class="mb-4 text-xs font-medium leading-none text-mid-gray">{{ title }}</h2>
    <slot />
  </section>
</template>
