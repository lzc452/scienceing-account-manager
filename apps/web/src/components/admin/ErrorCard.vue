<script setup>
import { TriangleAlert } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'

/**
 * 回收失败错误卡片（§5.5 / §6.2）：账号代码 + 错误信息 + 重试 / 人工处理完成。
 * ember 仅用于错误与破坏性语义（§4.1）。
 */
const props = defineProps({
  accountCode: { type: String, required: true },
  errorText: { type: String, default: '自动回收失败' },
})

const emit = defineEmits(['retry', 'fix'])
</script>

<template>
  <div class="rounded-3xl border border-ember/40 bg-status-error-soft p-5">
    <div class="flex items-start gap-3">
      <TriangleAlert class="mt-0.5 size-4 shrink-0 text-ember" />
      <div class="flex-1">
        <p class="text-sm font-medium text-ember">自动回收失败 · {{ accountCode }}</p>
        <p class="mt-1 text-sm text-mid-gray">{{ errorText }}</p>
      </div>
    </div>
    <!-- 窄屏按钮可换行，避免与长错误文案挤在一行 -->
    <div class="mt-4 flex flex-wrap justify-end gap-2">
      <Button variant="outline" size="sm" @click="emit('retry')">重试</Button>
      <Button variant="outline" size="sm" @click="emit('fix')">人工处理完成</Button>
    </div>
  </div>
</template>
