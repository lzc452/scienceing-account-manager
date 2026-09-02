<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Eye, EyeOff } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import { isLoggedIn, login } from '@/api'

const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const submitting = ref(false)
const errorMsg = ref('')

onMounted(() => {
  if (isLoggedIn.value) router.replace('/')
})

async function onSubmit() {
  if (submitting.value) return
  errorMsg.value = ''
  if (!username.value.trim() || !password.value) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  submitting.value = true
  try {
    await login(username.value.trim(), password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.replace(redirect)
  } catch (e) {
    // 统一文案，不区分「用户不存在」与「密码错误」（防账号枚举，PRD §5）
    errorMsg.value = e?.status === 401 ? '用户名或密码错误' : e?.message || '登录失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <!--
    登录页：整页唯一内容块，垂直 + 水平双向居中。
    卡片 max-w-[400px] 但用 w-full 兜底，320px 窄屏也不会撑出横向滚动。
  -->
  <div class="flex min-h-screen w-full items-center justify-center bg-canvas p-4 sm:p-6">
    <Card class="w-full max-w-[400px] p-6 sm:p-8">
      <!-- 标题字号 24 → 30px 递进，小屏不占满整行 -->
      <h1 class="text-center text-[24px] font-semibold leading-tight text-ink sm:text-[30px]">
        科应共享账号
      </h1>
      <p class="mt-1 text-center text-sm text-mid-gray">账号管理平台</p>

      <form class="mt-8 flex flex-col gap-4" @submit.prevent="onSubmit">
        <div>
          <Label for="login-username">用户名</Label>
          <Input
            id="login-username"
            v-model="username"
            placeholder="请输入用户名"
            autocomplete="username"
            class="mt-1.5"
          />
        </div>

        <div>
          <Label for="login-password">密码</Label>
          <div class="relative mt-1.5">
            <Input
              id="login-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入密码"
              autocomplete="current-password"
              class="pr-16"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 flex items-center gap-1 pr-3 text-xs font-medium text-mid-gray transition-colors hover:text-ink"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" class="size-4" />
              <Eye v-else class="size-4" />
              {{ showPassword ? '隐藏' : '显示' }}
            </button>
          </div>
        </div>

        <p v-if="errorMsg" class="text-xs font-medium text-ember" role="alert">
          {{ errorMsg }}
        </p>

        <Button type="submit" class="mt-1 w-full" :disabled="submitting">
          {{ submitting ? '登录中…' : '登录' }}
        </Button>
      </form>

      <p class="mt-6 text-center text-xs text-mid-gray">仅限内部员工使用</p>
    </Card>
  </div>
</template>
