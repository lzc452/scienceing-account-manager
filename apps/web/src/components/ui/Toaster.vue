<script setup>
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-vue-next'
import { dismissToast, toastState } from './toast'
</script>

<template>
  <Teleport to="body">
    <!--
      窄屏：left-4/right-4 双锚定撑满安全区，避免 w-full + right-4 导致左侧溢出；
      ≥640px：回到右下角固定宽度。
    -->
    <div
      class="pointer-events-none fixed bottom-4 right-4 left-4 z-[100] flex flex-col gap-2 sm:left-auto sm:w-full sm:max-w-sm"
    >
      <TransitionGroup name="toast">
        <div
          v-for="t in toastState.toasts"
          :key="t.id"
          class="animate-fade-in-up pointer-events-auto flex items-start gap-2.5 rounded-2xl border border-hairline bg-paper p-3.5 shadow-subtle"
        >
          <CircleCheck v-if="t.variant === 'success'" class="size-4 shrink-0 text-ink" />
          <TriangleAlert
            v-else-if="t.variant === 'destructive'"
            class="size-4 shrink-0 text-ember"
          />
          <Info v-else class="size-4 shrink-0 text-ink" />

          <div class="flex-1">
            <p class="text-sm font-medium leading-5 text-ink">{{ t.title }}</p>
            <p v-if="t.description" class="mt-0.5 text-xs leading-4 text-mid-gray">
              {{ t.description }}
            </p>
          </div>

          <button
            type="button"
            class="rounded-2xl p-0.5 text-mid-gray transition-colors hover:text-ink"
            aria-label="关闭"
            @click="dismissToast(t.id)"
          >
            <X class="size-4" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
