<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { Check, Copy, Eye, EyeOff } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

const MASK = '••••••••••••'
const REVEAL_TIMEOUT_MS = 30_000
const COPIED_TIMEOUT_MS = 6_000

/**
 * 密码遮蔽 / 显示 / 复制（§4.3）。
 * 默认遮蔽；显示后 30s 自动重新遮蔽；复制后 6s 显示「已复制 ✓」。
 * 显示 / 复制动作通过事件上抛（用于审计，不携带密码本体）。
 */
const props = defineProps({
  password: { type: String, required: true },
  class: { type: [String, Object, Array], default: undefined },
})

const emit = defineEmits(['reveal', 'copy'])

const visible = ref(false)
const copied = ref(false)

let maskTimer
let copyTimer

function scheduleMask() {
  clearMask()
  maskTimer = window.setTimeout(() => {
    visible.value = false
  }, REVEAL_TIMEOUT_MS)
}

function clearMask() {
  if (maskTimer !== undefined) {
    window.clearTimeout(maskTimer)
    maskTimer = undefined
  }
}

function toggle() {
  visible.value = !visible.value
  if (visible.value) {
    emit('reveal')
    scheduleMask()
  } else {
    clearMask()
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(props.password)
  } catch {
    // 非安全上下文 / 权限拒绝时静默失败，不打断流程
  }
  copied.value = true
  emit('copy')
  if (copyTimer !== undefined) window.clearTimeout(copyTimer)
  copyTimer = window.setTimeout(() => {
    copied.value = false
  }, COPIED_TIMEOUT_MS)
}

watch(
  () => props.password,
  () => {
    visible.value = false
    clearMask()
  },
)

onBeforeUnmount(() => {
  clearMask()
  if (copyTimer !== undefined) window.clearTimeout(copyTimer)
})
</script>

<template>
  <div :class="cn('flex items-center gap-2', props.class)">
    <code
      class="min-w-0 flex-1 truncate rounded-2xl bg-canvas px-3 py-2 text-sm text-ink tabular-nums"
    >
      {{ visible ? password : MASK }}
    </code>

    <button
      type="button"
      class="inline-flex h-8 shrink-0 items-center gap-1 rounded-2xl border border-hairline bg-transparent px-2.5 text-xs font-medium text-ink transition-colors hover:bg-surface-alt"
      :aria-label="visible ? '隐藏密码' : '显示密码'"
      @click="toggle"
    >
      <EyeOff v-if="visible" class="size-4" />
      <Eye v-else class="size-4" />
      {{ visible ? '隐藏' : '显示' }}
    </button>

    <button
      type="button"
      class="inline-flex h-8 shrink-0 items-center gap-1 rounded-2xl border border-hairline bg-transparent px-2.5 text-xs font-medium text-ink transition-colors hover:bg-surface-alt"
      :aria-label="copied ? '已复制' : '复制密码'"
      @click="copy"
    >
      <Check v-if="copied" class="size-4" />
      <Copy v-else class="size-4" />
      {{ copied ? '已复制' : '复制' }}
    </button>
  </div>
</template>
