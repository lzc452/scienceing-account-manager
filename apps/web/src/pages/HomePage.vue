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
  isLoggedIn,
  pluginState,
} from '@/api'
import { toStatusKind } from '@/lib/status'

const router = useRouter()

const loading = ref(true)
const error = ref('')
const availability = ref({ total: 0, available: 0, inUse: 0, recycling: 0, error: 0 })
const pool = ref([])
const hasActiveLease = ref(false)
const claiming = ref(false)

let pollTimer

async function load() {
  try {
    const [avail, rows] = await Promise.all([getAvailability(), getPool()])
    availability.value = avail
    pool.value = rows
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
</script>

<template>
  <PublicLayout>
    <!--
      页面栈：统一垂直留白节奏（gap-6），由 .app-main 负责内容稀少时垂直居中。
      不再自带 max-w/px/py —— 这些交给 .page-container，保证大屏居中、小屏不贴边。
    -->
    <div class="flex flex-col gap-6">
      <!--
        统计概览：四项指标收进一张卡片，用 1px gap 的 hairline 网格做分隔
        （卡片底 = hairline，单元格底 = paper，缝隙即分割线），
        既给出明确分区，又避免再引入一块大面积色块。
        2 列（移动端）→ 4 列（≥640px），字号随断点递进。
        助手检测组件已移至顶栏「科应共享账号」旁（PublicLayout）。
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
        <!-- 卡头：底部 hairline 与卡体分隔，形成清晰的头部带 -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-4 sm:p-5">
          <h2 class="text-base font-semibold leading-6 text-ink">账号池</h2>
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

        <div class="p-4 sm:p-5">
          <!-- 加载态 -->
          <div v-if="loading" class="flex flex-col gap-3">
            <Skeleton v-for="i in 6" :key="i" class="h-9 w-full" />
          </div>

          <!-- 错误态 -->
          <div v-else-if="error" class="flex flex-col items-start gap-3 py-2">
            <p class="text-sm text-mid-gray">{{ error }}，账号池数据暂不可用。</p>
            <Button variant="outline" size="sm" @click="load">重试</Button>
          </div>

          <!-- 空态 -->
          <p v-else-if="pool.length === 0" class="py-2 text-sm text-mid-gray">
            暂无科应账号，请联系管理员录入。
          </p>

          <!-- 列表 -->
          <ul v-else class="divide-y divide-hairline">
            <li
              v-for="account in pool"
              :key="account.code"
              class="animate-fade-in-up flex items-center gap-2 py-2.5 sm:gap-3"
            >
              <!-- 状态列宽度随断点收紧，给右侧「预计释放」留出可读空间 -->
              <StatusDot
                :status="toStatusKind(account.status)"
                class="w-20 shrink-0 sm:w-24"
              />
              <span class="w-14 shrink-0 text-sm font-medium tabular-nums text-ink sm:w-16">
                {{ account.code }}
              </span>
              <span class="min-w-0 flex-1 text-sm tabular-nums text-mid-gray">
                <template v-if="account.status === 'IN_USE' && remainingOf(account) != null">
                  预计释放 {{ formatDuration(remainingOf(account)) }}
                </template>
                <template v-else-if="account.status === 'ERROR'">
                  <span class="text-ember">需人工处理</span>
                </template>
              </span>
            </li>
          </ul>
        </div>
      </Card>
    </div>
  </PublicLayout>
</template>
