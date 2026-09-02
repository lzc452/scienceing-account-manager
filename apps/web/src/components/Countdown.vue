<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { cn } from '@/lib/utils'

/**
 * 倒计时 mm:ss（§4.2）：tabular-nums，每秒 tick；到 0 触发 `expire`。
 * 每秒 tick 不触发 aria-live（§9.2）。
 */
const props = defineProps({
  seconds: { type: Number, default: 0 },
  class: { type: [String, Object, Array], default: undefined },
})

const emit = defineEmits(['expire'])

const remaining = ref(Math.max(0, Math.floor(props.seconds)))

function format(total) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const display = computed(() => format(remaining.value))

let timer

function start() {
  stop()
  timer = window.setInterval(() => {
    if (remaining.value > 0) {
      remaining.value -= 1
      if (remaining.value === 0) emit('expire')
    }
  }, 1000)
}

function stop() {
  if (timer !== undefined) {
    window.clearInterval(timer)
    timer = undefined
  }
}

watch(
  () => props.seconds,
  (value) => {
    remaining.value = Math.max(0, Math.floor(value))
    start()
  },
  { immediate: true },
)

onBeforeUnmount(stop)
</script>

<template>
  <span :class="cn('tabular-nums', props.class)">{{ display }}</span>
</template>
