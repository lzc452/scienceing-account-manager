<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import { authState, logout } from '@/api'

/**
 * 管理后台布局：复用 App Shell（侧边栏 240px + 内容区 canvas），
 * 并注入当前管理员姓名与登出动作。
 */
const props = defineProps({
  /** 透传给 AppShell：'default' = 1280px，'narrow' = 768px（表单类稀疏页） */
  contentWidth: { type: String, default: 'default' },
})

const router = useRouter()
const adminName = computed(() => authState.user?.displayName || authState.user?.username || 'admin')

async function onLogout() {
  await logout()
  router.replace('/login')
}
</script>

<template>
  <AppShell :admin-name="adminName" :content-width="contentWidth" @logout="onLogout">
    <slot />
  </AppShell>
</template>
