<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({ class: { type: [String, Object, Array], default: undefined } })
</script>

<template>
  <!-- 内边距随断点收紧（px-2 → px-3），小屏多争取出约 1 列的有效宽度 -->
  <td :class="cn('px-2 py-2.5 align-middle text-sm text-ink sm:px-3', props.class)">
    <slot />
  </td>
</template>
