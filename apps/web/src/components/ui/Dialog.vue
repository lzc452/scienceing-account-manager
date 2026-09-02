<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { TriangleAlert, X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

/**
 * 对话框（24px 圆角，§6.1）。
 * 破坏性确认通过 `destructive` 在标题栏展示 ember 图标。
 */
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: undefined },
  description: { type: String, default: undefined },
  destructive: { type: Boolean, default: false },
  class: { type: [String, Object, Array], default: undefined },
})

const emit = defineEmits(['update:open', 'close'])

const contentRef = ref(null)

function close() {
  emit('update:open', false)
  emit('close')
}

function onGlobalKeydown(event) {
  if (event.key === 'Escape') close()
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      document.addEventListener('keydown', onGlobalKeydown)
      nextTick(() => contentRef.value?.focus())
    } else {
      document.removeEventListener('keydown', onGlobalKeydown)
    }
  },
)

onBeforeUnmount(() => document.removeEventListener('keydown', onGlobalKeydown))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <div
        class="animate-fade-in-up absolute inset-0 bg-ink/20"
        aria-hidden="true"
        @click="close"
      />
      <!--
        弹窗面板：max-h 85dvh + 纵向滚动，保证「创建用户」这类长表单在
        小屏/矮屏上也能完整滚动访问；shadow-overlay 让它压过遮罩层。
      -->
      <div
        ref="contentRef"
        tabindex="-1"
        :class="
          cn(
            'animate-dialog-in relative z-10 flex max-h-[85dvh] w-full max-w-md flex-col overflow-y-auto rounded-3xl border border-hairline bg-paper p-5 shadow-overlay outline-none',
            props.class,
          )
        "
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <h2
              v-if="title"
              class="flex items-center gap-2 text-base font-semibold leading-6 text-ink"
            >
              <TriangleAlert v-if="destructive" class="size-4 shrink-0 text-ember" />
              {{ title }}
            </h2>
            <p v-if="description" class="mt-1.5 text-sm leading-5 text-mid-gray">
              {{ description }}
            </p>
          </div>
          <button
            type="button"
            class="rounded-2xl p-1 text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink"
            aria-label="关闭"
            @click="close"
          >
            <X class="size-4" />
          </button>
        </div>

        <div v-if="$slots.default" class="mt-4">
          <slot />
        </div>

        <div v-if="$slots.footer" class="mt-5 flex items-center justify-end gap-2">
          <slot name="footer" :close="close" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
