<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { LogOut, Menu, X } from 'lucide-vue-next'
import PluginChip from '@/components/PluginChip.vue'
import { cn } from '@/lib/utils'
import { detectExtension, pluginState } from '@/api'

/** 与 Tailwind 的 lg 断点保持一致 */
const DESKTOP_QUERY = '(min-width: 1024px)'

/**
 * 管理后台 App Shell（§5.4）
 *
 * 布局与层次（本次优化）：
 * - 整体高度锁定为屏幕高度（h-screen + overflow-hidden）：左侧菜单高度恒等于
 *   屏幕高度且不随页面滚动；右侧 = 头部（左面包屑 / 右账号信息）+ Content。
 * - Content 宽度 = 屏幕宽 - 菜单宽，高度 = 屏幕高 - 头部高；内容超出时仅在
 *   Content 内部纵向滚动，宽度永不超出。
 * - Content：padding 12px、白底（paper），内容自上而下、自左而右排布，不居中；
 *   内部卡片取消边框、仅保留阴影。
 * - 断点 <1024px：侧边栏转为抽屉（fixed + 位移），顶栏出现汉堡按钮。
 * - 助手检测组件（PluginChip）位于侧边栏品牌区，紧邻「科应共享」。
 */
const props = defineProps({
  adminName: { type: String, default: 'admin' },
  version: { type: String, default: 'v1.0.0' },
  /** 兼容旧签名：内容栏宽度（新布局下 Content 恒为全宽，此参数仅保留兼容） */
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
  // 布局层启动扩展握手检测（幂等），供侧边栏品牌区的助手状态使用
  detectExtension()
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
  <!-- 整体锁定屏幕高度：页面级不滚动，滚动只发生在 Content 内部 -->
  <div class="flex h-screen w-full overflow-hidden bg-canvas">
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
      侧边栏：surface-alt(#fafafa) + 右侧 1px hairline 形成竖向分区。
      桌面端 static + 父容器 h-screen → 高度恒等于屏幕高度、不随内容滚动；
      移动端为 fixed 抽屉（最高一层阴影）。
    -->
    <aside
      id="admin-sidebar"
      :class="
        cn(
          'z-40 flex w-60 max-w-[80vw] shrink-0 flex-col border-r border-hairline bg-surface-alt',
          'fixed inset-y-0 left-0 transition-transform duration-200 ease-out lg:static lg:h-screen lg:translate-x-0',
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
          <!-- 助手检测组件：紧邻品牌区（管理员页面与公开页面同理） -->
          <PluginChip
            :state="pluginState.status"
            :version="pluginState.version"
            :min-version="pluginState.minimumVersion"
            class="mt-2"
          />
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

    <!--
      右侧面板：头部（左面包屑 / 右账号信息）+ Content。
      flex-col + min-h-0：Content 高度 = 屏幕高 - 头部高；overflow-y-auto 让
      超出内容只在 Content 内滚动；min-w-0 + overflow-x-hidden 保证宽度不超出。
    -->
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header
        class="flex h-14 shrink-0 items-center gap-3 border-b border-hairline bg-canvas px-4 sm:px-6"
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

      <!--
        Content：白底（paper）+ padding 12px；宽 = 屏宽 - 菜单宽，高 = 屏高 - 头部高；
        超出仅在内部滚动。内容自上而下、自左而右排布（默认块级流），不水平/垂直居中。
      -->
      <main class="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-paper p-3">
        <slot />
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
