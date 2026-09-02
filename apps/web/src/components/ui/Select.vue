<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

/**
 * 下拉选择（§6.1）：18px、#f5f5f5 填充。
 * options: [{ value, label, disabled? }]
 */
const props = defineProps({
  modelValue: { type: [String, Number], default: null },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: '请选择' },
  disabled: { type: Boolean, default: false },
  class: { type: [String, Object, Array], default: undefined },
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const rootRef = ref(null)

const selectedLabel = computed(
  () => props.options.find((o) => o.value === props.modelValue)?.label ?? props.placeholder,
)

function toggle() {
  if (props.disabled) return
  open.value = !open.value
}

function select(option) {
  if (option.disabled) return
  emit('update:modelValue', option.value)
  open.value = false
}

function onClickOutside(event) {
  if (rootRef.value && !rootRef.value.contains(event.target)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside))
</script>

<template>
  <div ref="rootRef" class="relative">
    <button
      type="button"
      :disabled="disabled"
      :class="
        cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-2xl border border-transparent bg-canvas px-3 text-sm text-ink focus:border-hairline focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          props.class,
        )
      "
      @click="toggle"
    >
      <span class="truncate">{{ selectedLabel }}</span>
      <ChevronDown
        :class="cn('size-4 shrink-0 text-mid-gray transition-transform', open && 'rotate-180')"
      />
    </button>

    <div
      v-if="open"
      class="absolute z-50 mt-1 w-full min-w-[8rem] rounded-2xl border border-hairline bg-paper p-1 shadow-subtle"
    >
      <div
        v-for="option in options"
        :key="option.value"
        role="option"
        :aria-selected="option.value === modelValue"
        :class="
          cn(
            'flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm',
            option.value === modelValue ? 'font-medium text-ink' : 'text-mid-gray',
            'hover:bg-surface-alt',
            option.disabled && 'cursor-not-allowed opacity-50',
          )
        "
        @click="select(option)"
      >
        <span>{{ option.label }}</span>
        <Check v-if="option.value === modelValue" class="size-4 shrink-0 text-ink" />
      </div>
    </div>
  </div>
</template>
