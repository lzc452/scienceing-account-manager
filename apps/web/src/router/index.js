import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '@/pages/HomePage.vue'
import LoginPage from '@/pages/LoginPage.vue'
import MyAccountPage from '@/pages/MyAccountPage.vue'
import AccountsPage from '@/pages/admin/AccountsPage.vue'
import UsersPage from '@/pages/admin/UsersPage.vue'
import LeasesPage from '@/pages/admin/LeasesPage.vue'
import LogsPage from '@/pages/admin/LogsPage.vue'
import SettingsPage from '@/pages/admin/SettingsPage.vue'
import ComponentShowcase from '@/views/ComponentShowcase.vue'
import { authState } from '@/api'

/**
 * 路由（PRD §38）。
 * `/design` 为 Phase 0 组件总览（供设计走查）。
 */
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/login', name: 'login', component: LoginPage },
    { path: '/my', name: 'my', component: MyAccountPage, meta: { requiresAuth: true } },
    // 首次登录强制改密（t14）：锁定页，未修改初始密码前不可进入任何其它页面
    { path: '/force-password', name: 'force-password', component: () => import('@/pages/ForcePasswordPage.vue') },
    { path: '/design', name: 'design', component: ComponentShowcase },
    // 使用手册：游客可读（只读渲染），管理员可在页内编辑。
    // 懒加载：markdown-it/DOMPurify 只在进入手册页时加载。
    { path: '/manual', name: 'manual', component: () => import('@/pages/ManualPage.vue') },
    { path: '/admin', redirect: '/admin/dashboard' },
    // 数据看板懒加载：echarts 体积较大，仅管理员访问看板时按需加载。
    {
      path: '/admin/dashboard',
      name: 'admin-dashboard',
      component: () => import('@/pages/admin/DashboardPage.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    { path: '/admin/accounts', name: 'admin-accounts', component: AccountsPage, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/admin/users', name: 'admin-users', component: UsersPage, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/admin/leases', name: 'admin-leases', component: LeasesPage, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/admin/logs', name: 'admin-logs', component: LogsPage, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/admin/settings', name: 'admin-settings', component: SettingsPage, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  // 首次登录强制改密（t14）：mustChangePassword 用户只能停留在 /force-password，
  // 其它任何页面（含登录页）一律重定向回改密页 —— 弹窗无法通过页面交互关闭。
  const forced = authState.token && authState.user?.mustChangePassword
  if (forced && to.name !== 'force-password') {
    return { name: 'force-password' }
  }
  if (to.name === 'force-password') {
    if (!authState.token) return { name: 'login' }
    if (!authState.user?.mustChangePassword) return { name: 'home' }
    return true
  }
  if (to.meta.requiresAuth && !authState.token) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  // 非管理员访问 /admin/*：无访问权限，重定向首页（403 语义）
  if (to.meta.requiresAdmin && authState.user?.role !== 'ADMIN') {
    return { name: 'home' }
  }
  if (to.name === 'login' && authState.token) {
    return { name: 'home' }
  }
  return true
})

export default router
