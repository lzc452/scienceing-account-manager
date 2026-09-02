<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({ class: { type: [String, Object, Array], default: undefined } })
</script>

<template>
  <th
    :class="
      cn(
        'h-10 whitespace-nowrap px-2 text-left align-middle text-xs font-medium text-mid-gray sm:px-3',
        props.class,
      )
    "
  >
    <slot />
  </th>
</template>
