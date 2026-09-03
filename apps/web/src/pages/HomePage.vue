<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PublicLayout from '@/layouts/PublicLayout.vue'
import StatBlock from '@/components/StatBlock.vue'
import StatusDot from '@/components/StatusDot.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { toast } from '@/components/ui/toast'
import {
  claimLease,
  formatDuration,
  getAvailability,
  getCurrentLease,
  getPool,
  isAdmin,
  isLoggedIn,
  pluginState,
} from '@/api'
import { getAdminAccounts } from '@/api/admin'
import { STATUS_META, toStatusKind } from '@/lib/status'

const router = useRouter()

const loading = ref(true)
const error = ref('')
const availability = ref({ total: 0, available: 0, inUse: 0, recycling: 0, error: 0 })
const pool = ref([])
const hasActiveLease = ref(false)
const claiming = ref(false)

let pollTimer

/**
 * 统一为卡片模型：公开池只有 code/status/estimatedReleaseAt（游客）；
 * 管理员视图额外含 id/username/currentUser/enabled，用于完整信息展示。
 * （管理操作按钮已迁移至 /admin/accounts，本页只读展示。）
 */
function normalizeCard(a) {
  return {
    id: a.id ?? null,
    code: a.code,
    username: a.username ?? '',
    status: toStatusKind(a.status),
    enabled: a.enabled ?? true,
    estimatedReleaseAt: a.estimatedReleaseAt ?? null,
    currentUser: a.currentUser ?? null,
  }
}

async function load() {
  try {
    const [avail] = await Promise.all([getAvailability()])
    availability.value = avail
    const rows = isAdmin.value ? await getAdminAccounts() : await getPool()
    pool.value = (rows || []).map(normalizeCard)
    error.value = ''

    if (isLoggedIn.value) {
      try {
        const { lease } = await getCurrentLease()
        hasActiveLease.value = Boolean(lease)
      } catch {
        hasActiveLease.value = false
      }
    }
  } catch (e) {
    error.value = e?.message || '服务不可用'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  pollTimer = window.setInterval(load, 10_000)
})

onBeforeUnmount(() => window.clearInterval(pollTimer))

const pluginReady = computed(() => pluginState.status === 'ready')

/** 由 estimatedReleaseAt（ISO 时间戳）计算剩余秒数。 */
function remainingOf(account) {
  if (!account?.estimatedReleaseAt) return null
  return Math.max(0, Math.floor((new Date(account.estimatedReleaseAt).getTime() - Date.now()) / 1000))
}

function cardVisual(a) {
  const m = STATUS_META[a.status] || STATUS_META.released
  let border = m.dot
  let bg = m.softBg
  let recycling = false
  if (a.status === 'recycling') recycling = a.enabled
  if (a.status === 'released') {
    border = '#d4d4d4'
    bg = '#fafafa'
  }
  if (!a.enabled) {
    border = '#d4d4d4'
    bg = '#fafafa'
    recycling = false
  }
  return { border, bg, recycling }
}

function cardStyle(a) {
  const v = cardVisual(a)
  return { border: `2px solid ${v.border}`, background: v.bg }
}

function statusLabel(s) {
  return (STATUS_META[s] || STATUS_META.released).label
}

const cta = computed(() => {
  if (!isLoggedIn.value) return { kind: 'login', label: '登录后使用' }
  if (hasActiveLease.value) return { kind: 'mine', label: '查看我的账号 →' }
  return { kind: 'claim', label: '我要使用科应' }
})

async function onCta() {
  const c = cta.value
  if (c.kind === 'login') {
    router.push('/login')
    return
  }
  if (c.kind === 'mine') {
    router.push('/my')
    return
  }
  claiming.value = true
  try {
    const res = await claimLease(pluginState.version)
    // 暂存 leaseToken（后端只存其哈希、无法从 current 还原），供「打开科应」BIND_AND_OPEN 使用
    if (res?.leaseToken) sessionStorage.setItem('scienceing_lease_token', res.leaseToken)
    toast({ title: `已领取 ${res.account.code}`, description: '正在跳转到我的账号…', variant: 'success' })
    router.push('/my')
  } catch (e) {
    toast({ title: e?.message || '领取失败', variant: e?.status === 409 ? 'default' : 'destructive' })
    load()
  } finally {
    claiming.value = false
  }
}

/**
 * 管理员点击卡片 → 进入 /admin/accounts（操作已集中到该页）；
 * 游客/普通用户点击无动作（返回 false）。
 */
function openAccount(card) {
  if (isAdmin.value && card?.id != null) {
    router.push('/admin/accounts')
  }
  return false
}
</script>

<template>
  <PublicLayout>
    <!--
      页面栈：统一垂直留白节奏（gap-6），由 .app-main 负责内容稀少时垂直居中。
      账号池看板为只读展示：管理操作（新增/导入/回收/改密/编辑/禁用/删除）在 /admin/accounts。
      管理员视图展示科应账号/使用者/禁用等完整信息；游客仅见公开池。
    -->
    <div class="flex flex-col gap-4 py-4 sm:py-5">
      <!--
        统计概览：四项指标收进一张卡片，用 1px gap 的 hairline 网格做分隔
        （卡片底 = hairline，单元格底 = paper，缝隙即分割线），
        2 列（移动端）→ 4 列（≥640px）。
      -->
      <Card class="overflow-hidden">
        <div
          class="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-4"
          v-if="loading"
        >
          <div v-for="i in 4" :key="i" class="flex flex-col gap-2 bg-paper p-4 sm:p-5">
            <Skeleton class="h-3 w-12" />
            <Skeleton class="h-8 w-14 sm:h-9" />
          </div>
        </div>

        <div v-else-if="error" class="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-4">
          <div class="flex flex-col gap-2 bg-paper p-4 sm:p-5">
            <span class="text-xs font-medium leading-none text-mid-gray">账号池</span>
            <span class="text-2xl font-semibold leading-none text-ember sm:text-[28px]">
              不可用
            </span>
          </div>
        </div>

        <div v-else class="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-4">
          <div class="bg-paper p-4 sm:p-5">
            <StatBlock label="可用" :value="availability.available" dot="#16a34a" />
          </div>
          <div class="bg-paper p-4 sm:p-5">
            <StatBlock label="使用中" :value="availability.inUse" dot="#2563eb" />
          </div>
          <div class="bg-paper p-4 sm:p-5">
            <StatBlock label="回收中" :value="availability.recycling" dot="#d97706" />
          </div>
          <div class="bg-paper p-4 sm:p-5">
            <StatBlock label="异常" :value="availability.error" dot="#e7000b" />
          </div>
        </div>
      </Card>

      <!-- 账号池 -->
      <Card>
        <!-- 卡头：标题 + 领取入口；新增/导入等管理操作已迁移至 /admin/accounts -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-2 sm:p-4">
          <h2 class="text-base font-semibold leading-6 text-ink">账号池</h2>
          <div class="flex flex-wrap items-center gap-2">
            <Button
              v-if="cta.kind === 'claim'"
              :disabled="!pluginReady || claiming"
              @click="onCta"
            >
              {{ claiming ? '领取中…' : cta.label }}
            </Button>
            <Button v-else-if="cta.kind === 'login'" variant="outline" @click="onCta">
              {{ cta.label }}
            </Button>
            <Button v-else variant="ghost" @click="onCta">
              {{ cta.label }}
            </Button>
          </div>
        </div>

        <div class="px-2 sm:px-5">
          <!-- 加载态 -->
          <div v-if="loading" class="flex flex-col gap-3 py-3">
            <Skeleton v-for="i in 4" :key="i" class="h-24 w-full" />
          </div>

          <!-- 错误态 -->
          <div v-else-if="error" class="flex flex-col items-start gap-3 py-3">
            <p class="text-sm text-mid-gray">{{ error }}，账号池数据暂不可用。</p>
            <Button variant="outline" size="sm" @click="load">重试</Button>
          </div>

          <!-- 空态 -->
          <p v-else-if="pool.length === 0" class="py-3 text-sm text-mid-gray">
            暂无科应账号，<template v-if="isAdmin">请前往「账号管理」页录入。</template><template v-else>请联系管理员录入。</template>
          </p>

          <!--
            卡片网格：不分页、全量展示，一行 4 个（≥768px 时 4 列，窄屏自动降列）。
            状态色边框/背景 + 回收中呼吸闪烁；仅信息展示，管理动作在 /admin/accounts。
            管理员点卡片跳转账号管理页；游客点击无动作。
          -->
          <div v-else class="grid grid-cols-1 gap-3 py-3 sm:grid-cols-2 md:grid-cols-4">
            <div
              v-for="card in pool"
              :key="card.id ?? card.code"
              class="account-card flex flex-col rounded-2xl p-4 shadow-sm cursor-pointer"
              :class="[!card.enabled ? 'opacity-60' : '', cardVisual(card).recycling ? 'is-recycling' : '']"
              :style="cardStyle(card)"
              @click="openAccount(card)"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="truncate text-sm font-semibold text-ink">{{ card.code }}</div>
                  <div v-if="isAdmin && card.username" class="truncate text-xs text-mid-gray">{{ card.username }}</div>
                </div>
                <StatusDot :status="card.status" :label="card.enabled ? '' : '已禁用'" />
              </div>

              <div class="mt-2 text-xs text-mid-gray">
                <template v-if="card.status === 'in_use'">
                  <template v-if="isAdmin && card.currentUser">使用中 · {{ card.currentUser }}</template>
                  <template v-else-if="remainingOf(card) != null">预计释放 {{ formatDuration(remainingOf(card)) }}</template>
                  <template v-else>使用中</template>
                </template>
                <template v-else-if="card.status === 'recycling'">回收中…</template>
                <template v-else-if="card.status === 'error'"><span class="text-ember">需人工处理</span></template>
                <template v-else-if="!card.enabled"><span class="text-ember">已禁用</span></template>
                <template v-else-if="card.status === 'available'">可领取</template>
                <template v-else>{{ statusLabel(card.status) }}</template>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </PublicLayout>
</template>

<style scoped>
.account-card {
  transition: border-color 0.2s, background 0.2s;
}
.is-recycling {
  animation: recyclePulse 1.4s ease-in-out infinite;
}
@keyframes recyclePulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(217, 119, 6, 0);
    border-color: #d97706;
  }
  50% {
    box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.18);
    border-color: #f59e0b;
  }
}
</style>
