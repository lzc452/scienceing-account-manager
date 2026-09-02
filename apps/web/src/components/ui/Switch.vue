<script setup>
import { cn } from '@/lib/utils'

/**
 * 开关（§6.1）：ink 轨道 + paper 滑块（唯一「彩色感」元素，仍为黑白）。
 */
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  class: { type: [String, Object, Array], default: undefined },
})

const emit = defineEmits(['update:modelValue'])

function toggle() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    :class="
      cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        modelValue ? 'bg-ink' : 'border border-hairline bg-canvas',
        props.class,
      )
    "
    @click="toggle"
  >
    <span
      :class="
        cn(
          'pointer-events-none block h-4 w-4 rounded-full transition-transform',
          modelValue ? 'translate-x-[22px] bg-paper' : 'translate-x-1 bg-mid-gray',
        )
      "
    />
  </button>
</template>
