<script setup>
import { ref } from 'vue'
import { cn } from '@/lib/utils'

/** 多行文本框（与 Input.vue 同风格：canvas 底 + hairline 聚焦描边）。 */
const props = defineProps({
  class: { type: [String, Object, Array], default: undefined },
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: undefined },
  rows: { type: Number, default: 12 },
  spellcheck: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const el = ref(null)

function onInput(event) {
  emit('update:modelValue', event.target.value)
}

/** 暴露内部 DOM：父组件（Markdown 编辑器）需读 selectionStart/End 并做光标定位。 */
defineExpose({
  el,
  focus: () => el.value?.focus(),
})
</script>

<template>
  <textarea
    ref="el"
    :value="modelValue"
    :rows="rows"
    :placeholder="placeholder"
    :spellcheck="spellcheck"
    :class="
      cn(
        'w-full resize-y rounded-2xl border border-transparent bg-canvas px-3 py-2 text-sm leading-6 text-ink placeholder:text-mid-gray focus:border-hairline focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
    @input="onInput"
  />
</template>
