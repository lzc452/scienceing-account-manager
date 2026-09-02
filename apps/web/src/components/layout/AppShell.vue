<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { LogOut, Menu, X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

/** 与 Tailwind 的 lg 断点保持一致 */
const DESKTOP_QUERY = '(min-width: 1024px)'

/**
 * 管理后台 App Shell（§5.4）
 *
 * 布局与层次（本次优化）：
 * - 断点 ≥1024px：侧边栏 240px 常驻（surface-alt + 右侧 hairline，与 canvas 明确分界）；
 *   断点 <1024px：侧边栏转为抽屉（fixed + 位移），顶栏出现汉堡按钮，内容区始终
 *   占满可用宽度，绝不产生横向滚动。
 * - 顶栏与内容区同用 canvas 底色，仅靠 1px hairline 分隔：白(paper) 只留给卡片，
 *   避免大面积白块与灰块生硬拼接。
 * - 内容区统一走 .page-container：最大宽度 + 水平居中，大屏不被拉伸。
 */
const props = defineProps({
  adminName: { type: String, default: 'admin' },
  version: { type: String, default: 'v1.0.0' },
  /** 内容栏宽度：'default' = 1280px（列表/表格），'narrow' = 768px（表单/稀疏页） */
  contentWidth: { type: String, default: 'default' },
})

const emit = defineEmits(['logout'])

const route = useRoute()

/** 移动端抽屉开合状态 */
const drawerOpen = ref(false)

/** 桌面端：侧边栏常驻。用于决定抽屉关闭时是否需要对辅助技术隐藏 */
const isDesktop = ref(false)

let mediaQuery

function syncViewport(event) {
  isDesktop.value = event.matches
  if (isDesktop.value) drawerOpen.value = false
}

onMounted(() => {
  mediaQuery = window.matchMedia(DESKTOP_QUERY)
  isDesktop.value = mediaQuery.matches
  mediaQuery.addEventListener('change', syncViewport)
})

onBeforeUnmount(() => mediaQuery?.removeEventListener('change', syncViewport))

// 路由变化后自动收起抽屉，避免遮挡新页面内容
watch(() => route.fullPath, () => {
  drawerOpen.value = false
})

/**
 * 抽屉关闭且处于移动端时，侧边栏在视觉上不可见——
 * 此时对辅助技术隐藏，避免键盘 Tab 焦点掉进屏幕外区域。
 */
const sidebarHidden = computed(() => !isDesktop.value && !drawerOpen.value)

const navItems = [
  { label: '账号池看板', path: '/' },
  { label: '账号管理', path: '/admin/accounts' },
  { label: '用户管理', path: '/admin/users' },
  { label: '租约记录', path: '/admin/leases' },
  { label: '系统日志', path: '/admin/logs' },
  { label: '系统参数', path: '/admin/settings' },
]

const currentLabel = computed(
  () => navItems.find((item) => item.path === route.path)?.label ?? '管理',
)

function isActive(path) {
  return route.path === path
}
</script>

<template>
  <div class="flex min-h-screen w-full bg-canvas">
    <!-- 抽屉遮罩：仅移动端生效，压暗内容区但不阻断页面纵向滚动 -->
    <Transition name="drawer-fade">
      <div
        v-if="drawerOpen"
        class="fixed inset-0 z-30 bg-ink/20 lg:hidden"
        aria-hidden="true"
        @click="drawerOpen = false"
      />
    </Transition>

    <!--
      侧边栏：surface-alt(#fafafa) 比 canvas 亮一档，配合右侧 1px hairline
      形成明确的竖向分区；移动端为 fixed 抽屉（最高一层阴影）。
    -->
    <aside
      id="admin-sidebar"
      :class="
        cn(
          'z-40 flex w-60 max-w-[80vw] shrink-0 flex-col border-r border-hairline bg-surface-alt',
          'fixed inset-y-0 left-0 transition-transform duration-200 ease-out lg:static lg:translate-x-0',
          drawerOpen ? 'translate-x-0 shadow-overlay' : '-translate-x-full',
        )
      "
      :aria-hidden="sidebarHidden ? 'true' : undefined"
      :inert="sidebarHidden || undefined"
    >
      <div class="flex items-start justify-between px-5 pb-4 pt-6">
        <div class="min-w-0">
          <div class="truncate text-base font-semibold leading-6 text-ink">科应共享</div>
          <div class="mt-0.5 text-xs text-mid-gray">账号管理平台</div>
        </div>
        <!-- 仅在抽屉态需要关闭按钮 -->
        <button
          type="button"
          class="-mr-1.5 rounded-2xl p-1.5 text-mid-gray transition-colors hover:bg-canvas hover:text-ink lg:hidden"
          aria-label="关闭导航"
          @click="drawerOpen = false"
        >
          <X class="size-4" />
        </button>
      </div>

      <nav class="flex-1 space-y-1 overflow-y-auto px-3" aria-label="管理导航">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          :class="
            cn(
              'flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm transition-colors',
              isActive(item.path)
                ? 'bg-paper font-medium text-ink shadow-subtle'
                : 'text-mid-gray hover:bg-canvas hover:text-ink',
            )
          "
          :aria-current="isActive(item.path) ? 'page' : undefined"
        >
          <span
            :class="
              cn(
                'size-2 shrink-0 rounded-full',
                isActive(item.path) ? 'bg-ink' : 'border border-hairline',
              )
            "
            aria-hidden="true"
          />
          <span class="truncate">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="border-t border-hairline px-5 py-4 text-xs text-mid-gray">
        {{ version }}
      </div>
    </aside>

    <!-- 内容列：min-w-0 保证内部表格 / 长文本只在本列内收缩、不撑破页面 -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-canvas/90 px-4 backdrop-blur sm:px-6"
      >
        <button
          type="button"
          class="-ml-1.5 shrink-0 rounded-2xl p-1.5 text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink lg:hidden"
          :aria-expanded="drawerOpen"
          aria-controls="admin-sidebar"
          aria-label="打开导航"
          @click="drawerOpen = true"
        >
          <Menu class="size-5" />
        </button>

        <!-- 面包屑：min-w-0 + truncate，窄屏不挤压右侧操作区 -->
        <nav class="min-w-0 flex-1 truncate text-sm" aria-label="面包屑">
          <span class="text-mid-gray">管理</span>
          <span class="mx-1 text-mid-gray" aria-hidden="true">/</span>
          <span class="text-ink">{{ currentLabel }}</span>
        </nav>

        <div class="flex shrink-0 items-center gap-2 sm:gap-3">
          <span class="hidden max-w-[10rem] truncate text-sm text-mid-gray sm:inline">
            {{ adminName }}
          </span>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-2xl px-2.5 py-1.5 text-sm font-medium text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink"
            @click="emit('logout')"
          >
            <LogOut class="size-4" />
            <span class="hidden sm:inline">退出</span>
          </button>
        </div>
      </header>

      <!-- 内容承载区：统一留白节奏 + 内容少时垂直居中 -->
      <main class="app-main">
        <div
          :class="
            cn('page-container', contentWidth === 'narrow' && 'page-container-narrow')
          "
        >
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 150ms ease-out;
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}
</style>
