<script setup>
import { computed } from 'vue'
import { Download } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

/**
 * 插件状态条（§4.4）：就绪（绿）/ 未安装 / 版本过旧（琥珀警告）。
 * 未就绪时禁用领取并给出下载入口。
 */
const props = defineProps({
  state: { type: String, default: 'missing' },
  version: { type: String, default: undefined },
  minVersion: { type: String, default: undefined },
  class: { type: [String, Object, Array], default: undefined },
})

const emit = defineEmits(['download'])

const meta = computed(() => {
  switch (props.state) {
    case 'ready':
      return { dot: '#16a34a', bg: '#f0fdf4', text: '#15803d', label: `助手已就绪 · ${props.version || '1.0.0'}` }
    case 'outdated':
      return { dot: '#d97706', bg: '#fffbeb', text: '#b45309', label: `版本过旧 ${props.version || '?'} → 最低 ${props.minVersion || '?'}` }
    case 'error':
      return { dot: '#d97706', bg: '#fffbeb', text: '#b45309', label: '服务连接异常' }
    case 'missing':
    default:
      return { dot: '#d97706', bg: '#fffbeb', text: '#b45309', label: '未检测到助手' }
  }
})

// const downloadLabel = computed(() => (props.state === 'outdated' ? '下载最新版' : '下载插件'))
</script>

<template>
  <div :class="cn('flex items-center gap-1', props.class)">
    <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: meta.dot }" aria-hidden="true" />
    <span
      class="inline-flex items-center gap-1 rounded-2xl px-2 text-xs font-medium"
      :style="{ backgroundColor: meta.bg, color: meta.text }"
    >
      {{ meta.label }}
    </span>
    <button
      v-if="state === 'missing' || state === 'outdated'"
      type="button"
      class="inline-flex items-center gap-1 rounded-2xl px-2 py-0.5 text-xs font-medium text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink"
      @click="emit('download')"
    >
      <Download class="size-3.5" />
    </button>
  </div>
</template>
