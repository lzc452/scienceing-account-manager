<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { LogOut } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import PluginChip from '@/components/PluginChip.vue'
import { authState, detectExtension, isLoggedIn, logout, pluginState } from '@/api'

/**
 * 公开布局（首页 / 我的账号）
 *
 * 布局与层次（本次优化）：
 * - 顶栏与页面同用 canvas 底色，仅靠 1px hairline 分隔；paper(#ffffff) 只留给
 *   内容卡片。整站只有一条背景基线，白色永远是「被承载的内容面」。
 * - 顶栏右侧导航在窄屏逐级降级（隐藏用户名 → 退出按钮只留图标），
 *   保证 320px 宽下不换行、不溢出。
 * - 助手检测组件（PluginChip）常驻顶栏「科应共享账号」旁，全站可见。
 */
const props = defineProps({
  /** 内容栏宽度：'default' = 1280px，'narrow' = 768px（稀疏页居中显示） */
  contentWidth: { type: String, default: 'default' },
})

const router = useRouter()
const userLabel = computed(() => authState.user?.displayName || authState.user?.username || '')
const isAdmin = computed(() => authState.user.role === "ADMIN" || false)

// 布局层启动扩展握手检测（幂等），保证顶栏的助手状态在任何页面都可用
onMounted(() => {
  console.log('PublicLayout mounted, detectExtension()')
  // 显示authState.user
  console.log('authState.user:', authState.user)
  detectExtension()
})

async function onLogout() {
  await logout()
  router.push('/')
}

/** 退出登录二次确认弹窗 */
const logoutOpen = ref(false)
function confirmLogout() {
  logoutOpen.value = false
  onLogout()
}
</script>

<template>
  <div class="flex min-h-screen w-full flex-col bg-canvas">
    <header
      class="sticky top-0 z-20 border-b border-hairline bg-canvas/90 backdrop-blur"
    >
      <!-- 顶栏内部沿用与内容区一致的容器宽度，brand 与内容左边缘严格对齐 -->
      <div class="page-container flex h-14 items-center gap-3">
        <RouterLink to="/" class="min-w-0 shrink-0 text-base font-semibold leading-6 text-ink">
          科应共享账号
        </RouterLink>

        <!-- 助手检测组件：常驻头部，紧跟「科应共享账号」 -->
        <PluginChip
          :state="pluginState.status"
          :version="pluginState.version"
          :min-version="pluginState.minimumVersion"
          class="hidden sm:flex"
        />

        <div class="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <template v-if="isLoggedIn">
            <RouterLink
              v-if="isAdmin"
              to="/admin/accounts"
              class="rounded-2xl px-2 py-1.5 text-sm text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink"
            >
              管理后台
            </RouterLink>
            <RouterLink
              to="/my"
              class="rounded-2xl px-2 py-1.5 text-sm text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink"
            >
              我的账号
            </RouterLink>
            <!-- 用户名在窄屏隐藏：优先保证主导航可点 -->
            <span class="hidden max-w-[8rem] truncate text-sm text-mid-gray md:inline">
              {{ userLabel }}
            </span>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-2xl px-2.5 py-1.5 text-sm font-medium text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink"
              @click="logoutOpen = true"
            >
              <LogOut class="size-4" />
              <span class="hidden sm:inline">退出</span>
            </button>
          </template>

          <RouterLink v-else to="/login">
            <Button variant="outline" size="sm">登录</Button>
          </RouterLink>
        </div>
      </div>
    </header>

    <!-- 内容承载区：统一留白节奏 + 内容少时垂直居中 -->
    <main class="app-main bg-white">
      <div :class="['page-container', contentWidth === 'narrow' && 'page-container-narrow']">
        <slot />
      </div>
    </main>

    <Dialog
      :open="logoutOpen"
      title="退出登录？"
      description="退出后将返回登录页，需重新登录才能继续访问账号。"
      @update:open="(v) => (logoutOpen = v)"
    >
      <template #footer>
        <Button variant="outline" @click="logoutOpen = false">取消</Button>
        <Button variant="default" @click="confirmLogout">确认退出</Button>
      </template>
    </Dialog>
  </div>
</template>
