<script setup>
import { isPasswordAllowed, passwordPolicyMessage } from '@scienceing/shared/password-policy'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Eye, EyeOff, KeyRound } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import { toast } from '@/components/ui/toast'
import { authState, changePassword, isLoggedIn } from '@/api'

/**
 * 首次登录强制改密页（t14）：
 * 管理员新建/重置的用户，首次登录后必须在此修改初始密码——
 * 无关闭/跳过入口（路由守卫已把所有其它页面重定向到这里，后端业务接口亦被拦截），
 * 修改成功即视为登录完成，直接进入首页账号池。
 */
const router = useRouter()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showCurrent = ref(false)
const showNew = ref(false)
const showConfirm = ref(false)
const submitting = ref(false)
const errorMsg = ref('')

onMounted(() => {
  if (!isLoggedIn.value) router.replace('/login')
  else if (!authState.user?.mustChangePassword) router.replace('/')
})

async function onSubmit() {
  if (submitting.value) return
  errorMsg.value = ''
  const current = currentPassword.value
  const next = newPassword.value
  const confirm = confirmPassword.value

  if (!current) {
    errorMsg.value = '请输入当前密码（初始密码）'
    return
  }
  if (!isPasswordAllowed(next)) {
    errorMsg.value = passwordPolicyMessage('新密码')
    return
  }
  if (next !== confirm) {
    errorMsg.value = '两次输入的新密码不一致'
    return
  }
  if (next === current) {
    errorMsg.value = '新密码不能与当前密码相同'
    return
  }

  submitting.value = true
  try {
    // 改密成功 = 登录完成：后端清除强制标志并返回最新用户，直接进入首页账号池
    await changePassword(current, next)
    toast({ title: '密码修改成功，正在进入平台', variant: 'success' })
    router.replace('/')
  } catch (e) {
    errorMsg.value = e?.message || '修改失败，请重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen w-full items-center justify-center bg-canvas p-4 sm:p-6">
    <Card class="w-full max-w-[400px] p-6 sm:p-8">
      <div class="flex flex-col items-center text-center">
        <div class="flex size-11 items-center justify-center rounded-2xl bg-canvas">
          <KeyRound class="size-5 text-mid-gray" />
        </div>
        <h1 class="mt-3 text-[22px] font-semibold leading-tight text-ink sm:text-2xl">首次登录需修改密码</h1>
        <p class="mt-2 text-sm leading-relaxed text-mid-gray">
          你正在使用管理员分配的初始密码，为保障账号安全，请先设置专属新密码。此步骤无法跳过或关闭。
        </p>
      </div>

      <form class="mt-6 flex flex-col gap-4" @submit.prevent="onSubmit">
        <div>
          <Label for="fp-current">当前密码（初始密码）</Label>
          <div class="relative mt-1.5">
            <Input
              id="fp-current"
              v-model="currentPassword"
              :type="showCurrent ? 'text' : 'password'"
              placeholder="请输入初始密码"
              autocomplete="current-password"
              class="pr-16"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 flex items-center gap-1 pr-3 text-xs font-medium text-mid-gray transition-colors hover:text-ink"
              @click="showCurrent = !showCurrent"
            >
              <EyeOff v-if="showCurrent" class="size-4" />
              <Eye v-else class="size-4" />
              {{ showCurrent ? '隐藏' : '显示' }}
            </button>
          </div>
        </div>

        <div>
          <Label for="fp-new">新密码</Label>
          <div class="relative mt-1.5">
            <Input
              id="fp-new"
              v-model="newPassword"
              :type="showNew ? 'text' : 'password'"
              placeholder="至少 8 个字符，最多 72 个 UTF-8 字节"
              autocomplete="new-password"
              class="pr-16"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 flex items-center gap-1 pr-3 text-xs font-medium text-mid-gray transition-colors hover:text-ink"
              @click="showNew = !showNew"
            >
              <EyeOff v-if="showNew" class="size-4" />
              <Eye v-else class="size-4" />
              {{ showNew ? '隐藏' : '显示' }}
            </button>
          </div>
        </div>

        <div>
          <Label for="fp-confirm">确认新密码</Label>
          <div class="relative mt-1.5">
            <Input
              id="fp-confirm"
              v-model="confirmPassword"
              :type="showConfirm ? 'text' : 'password'"
              placeholder="再次输入新密码"
              autocomplete="new-password"
              class="pr-16"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 flex items-center gap-1 pr-3 text-xs font-medium text-mid-gray transition-colors hover:text-ink"
              @click="showConfirm = !showConfirm"
            >
              <EyeOff v-if="showConfirm" class="size-4" />
              <Eye v-else class="size-4" />
              {{ showConfirm ? '隐藏' : '显示' }}
            </button>
          </div>
        </div>

        <p v-if="errorMsg" class="text-xs font-medium text-ember" role="alert">
          {{ errorMsg }}
        </p>

        <Button type="submit" class="mt-1 w-full" :disabled="submitting">
          {{ submitting ? '提交中…' : '保存新密码并进入平台' }}
        </Button>
      </form>

      <p class="mt-6 text-center text-xs text-mid-gray">密码仅用于登录本平台，与科应账号密码相互独立</p>
    </Card>
  </div>
</template>
