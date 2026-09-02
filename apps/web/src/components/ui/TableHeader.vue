<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({ class: { type: [String, Object, Array], default: undefined } })
</script>

<template>
  <!--
    表头带：surface-alt(#fafafa) 比白色表体暗一档，配合上下 hairline
    形成「页面 canvas → 卡片 paper → 表头 band」的三级灰阶，
    让表格头部成为明确的分区而不是一条孤立的线。
  -->
  <thead
    :class="
      cn('surface-band [&_tr]:border-b-0 [&_tr]:border-t-0', props.class)
    "
  >
    <slot />
  </thead>
</template>
