<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PublicLayout from '@/layouts/PublicLayout.vue'
import Countdown from '@/components/Countdown.vue'
import PasswordReveal from '@/components/PasswordReveal.vue'
import ProgressHairline from '@/components/ProgressHairline.vue'
import StatusDot from '@/components/StatusDot.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Dialog from '@/components/ui/Dialog.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { toast } from '@/components/ui/toast'
import { Check, Copy } from 'lucide-vue-next'
import { formatDuration, getCurrentLease, pluginState, releaseLease } from '@/api'
import { toStatusKind } from '@/lib/status'

const INACTIVITY_TIMEOUT_SECONDS = 1800

const router = useRouter()

const loading = ref(true)
const error = ref('')
const lease = ref(null)
const account = ref(null)
const releasing = ref(false)
const confirmOpen = ref(false)
const releasePending = ref(false)
const usernameCopied = ref(false)

let usernameCopyTimer

const accountUsername = computed(() => account.value?.username || lease.value?.accountUsername || '')

async function copyUsername() {
  if (!accountUsername.value) return
  try {
    await navigator.clipboard.writeText(accountUsername.value)
  } catch {
    // 非安全上下文 / 权限拒绝时静默失败
  }
  usernameCopied.value = true
  if (usernameCopyTimer !== undefined) window.clearTimeout(usernameCopyTimer)
  usernameCopyTimer = window.setTimeout(() => {
    usernameCopied.value = false
  }, 6000)
}

let pollTimer

async function load() {
  try {
    const res = await getCurrentLease()
    lease.value = res.lease
    account.value = res.account
    error.value = ''
  } catch (e) {
    error.value = e?.message || '服务不可用'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  pollTimer = window.setInterval(load, 10_000)
  window.addEventListener('message', onExtensionAck)
})

onBeforeUnmount(() => {
  window.clearInterval(pollTimer)
  window.removeEventListener('message', onExtensionAck)
  if (usernameCopyTimer !== undefined) window.clearTimeout(usernameCopyTimer)
})

/** 扩展 BIND_ACK 反馈（协议见 apps/extension/src/content/dashboard.js）。 */
function onExtensionAck(event) {
  if (event.source !== window || event.data?.source !== 'scienceing-extension') return
  if (event.data?.type !== 'BIND_ACK') return
  if (event.data.ok) {
    toast({ title: '科应已在新标签页打开', variant: 'success' })
  } else {
    toast({ title: '打开科应失败', description: event.data?.error || '请确认已安装科应账号助手', variant: 'destructive' })
  }
}

const progress = computed(() => {
  if (!lease.value) return 0
  const remaining = Math.max(0, lease.value.remainingSeconds ?? 0)
  return Math.min(100, Math.round(((INACTIVITY_TIMEOUT_SECONDS - remaining) / INACTIVITY_TIMEOUT_SECONDS) * 100))
})

function relativeTime(iso) {
  if (!iso) return '—'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  return `${Math.floor(seconds / 3600)} 小时前`
}

function onOpenScienceing() {
  const leaseId = lease.value?.id
  const leaseToken = sessionStorage.getItem('scienceing_lease_token')
  const accountCode = account.value?.code || lease.value?.accountCode
  if (!leaseId || !leaseToken) {
    toast({ title: '无法打开科应', description: '缺少租约绑定信息，请重新领取账号', variant: 'destructive' })
    return
  }
  // 协议见 apps/extension/src/content/dashboard.js：看板 → 扩展 postMessage BIND_AND_OPEN
  window.postMessage(
    { source: 'scienceing-dashboard', type: 'BIND_AND_OPEN', leaseId, leaseToken, accountCode },
    '*',
  )
  toast({ title: '正在打开科应', description: `${accountCode} 将在新标签页打开` })
}

async function onRelease() {
  if (!lease.value || releasing.value) return
  releasing.value = true
  try {
    await releaseLease(lease.value.id)
    sessionStorage.removeItem('scienceing_lease_token')
    releasePending.value = true
    confirmOpen.value = false
    lease.value = null
    account.value = null
    toast({ title: '已提交归还', description: '账号正在回收，密码重置后即可重新领取' })
  } catch (e) {
    toast({ title: e?.message || '归还失败', variant: 'destructive' })
  } finally {
    releasing.value = false
  }
}
</script>

<template>
  <!--
    contentWidth="narrow"：本页只有一张卡片，属于典型「内容稀少」页面。
    收窄到 768px 并水平居中，配合 .app-main 的垂直居中，
    避免大屏上单张卡片被拉满 1280px 造成的失衡留白。
  -->
  <PublicLayout content-width="narrow">
    <div class="flex flex-col gap-6">
      <!-- 加载态 -->
      <Card v-if="loading">
        <div class="flex flex-col gap-3 p-4 sm:p-5">
          <Skeleton class="h-3 w-32" />
          <Skeleton class="h-9 w-24" />
          <Skeleton class="h-9 w-full" />
          <Skeleton class="h-9 w-full" />
        </div>
      </Card>

      <!-- 错误态 -->
      <Card v-else-if="error">
        <div class="flex flex-col items-start gap-3 p-4 sm:p-5">
          <p class="text-sm text-mid-gray">{{ error }}，当前租约信息暂不可用。</p>
          <Button variant="outline" size="sm" @click="load">重试</Button>
        </div>
      </Card>

      <!-- 有租约 -->
      <Card v-else-if="lease">
        <div class="p-4 sm:p-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-sm font-medium text-mid-gray">已分配科应账号</h2>
            <StatusDot :status="toStatusKind(lease.status)" />
          </div>

          <div class="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <!-- 账号主数值：28 → 32 → 36px 递进，小屏不被撑破 -->
            <div
              class="text-[28px] font-semibold leading-none tracking-[-0.025em] text-ink tabular-nums sm:text-[32px] lg:text-[36px]"
            >
              {{ account?.code || lease.accountCode }}
            </div>
            <Badge v-if="pluginState.status === 'ready'" tone="available">
              助手已就绪 · {{ pluginState.version }}
            </Badge>
          </div>

          <div class="mt-6">
            <div class="mb-1.5 text-xs font-medium text-mid-gray">科应账号</div>
            <div class="flex items-center gap-2">
              <code class="min-w-0 flex-1 truncate rounded-2xl bg-canvas px-3 py-2 text-sm text-ink tabular-nums">
                {{ accountUsername || '—' }}
              </code>
              <button
                type="button"
                class="inline-flex h-8 shrink-0 items-center gap-1 rounded-2xl border border-hairline bg-transparent px-2.5 text-xs font-medium text-ink transition-colors hover:bg-surface-alt"
                :aria-label="usernameCopied ? '已复制' : '复制科应账号'"
                @click="copyUsername"
              >
                <Check v-if="usernameCopied" class="size-4" />
                <Copy v-else class="size-4" />
                {{ usernameCopied ? '已复制' : '复制' }}
              </button>
            </div>
          </div>

          <div class="mt-6">
            <div class="mb-1.5 text-xs font-medium text-mid-gray">密码</div>
            <PasswordReveal :password="account?.password || ''" />
          </div>

          <!-- 窄屏两个主操作纵向堆叠，避免按钮被压成两行文字 -->
          <div class="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button class="flex-1" @click="onOpenScienceing">打开科应</Button>
            <Button variant="outline" class="flex-1" @click="confirmOpen = true">
              立即归还
            </Button>
          </div>

          <dl class="mt-6 space-y-2 border-t border-hairline pt-5">
            <div class="flex justify-between gap-4 text-sm">
              <dt class="text-mid-gray">最后操作</dt>
              <dd class="text-ink">{{ relativeTime(lease.lastActivityAt) }}</dd>
            </div>
            <div class="flex justify-between gap-4 text-sm">
              <dt class="text-mid-gray">预计自动释放</dt>
              <dd class="tabular-nums text-ink">
                <Countdown :seconds="lease.remainingSeconds ?? 0" />
              </dd>
            </div>
          </dl>

          <ProgressHairline :value="progress" class="mt-4" />
        </div>
      </Card>

      <!-- 归还中信息条（本地瞬时态） -->
      <Card v-else-if="releasePending">
        <div class="p-4 sm:p-5">
          <Badge tone="recycling">账号正在回收</Badge>
          <p class="mt-3 text-sm text-mid-gray">密码重置后即可重新领取。</p>
        </div>
      </Card>

      <!-- 无租约空态 -->
      <Card v-else>
        <div class="flex flex-col items-start gap-4 p-4 sm:p-5">
          <h2 class="text-base font-semibold text-ink">当前没有使用中的科应账号</h2>
          <p class="text-sm text-mid-gray">领取后即可在此查看账号与密码。</p>
          <Button @click="router.push('/')">我要使用科应</Button>
        </div>
      </Card>
    </div>

    <Dialog
      v-model:open="confirmOpen"
      title="立即归还"
      description="归还后将重置密码并退出当前科应会话。"
      destructive
    >
      <template #footer="{ close }">
        <Button variant="outline" @click="close">取消</Button>
        <Button variant="destructive" :disabled="releasing" @click="onRelease">
          {{ releasing ? '回收中…' : '确认归还' }}
        </Button>
      </template>
    </Dialog>
  </PublicLayout>
</template>
