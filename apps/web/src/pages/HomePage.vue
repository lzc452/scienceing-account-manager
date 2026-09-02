<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PublicLayout from '@/layouts/PublicLayout.vue'
import StatBlock from '@/components/StatBlock.vue'
import StatusDot from '@/components/StatusDot.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Dialog from '@/components/ui/Dialog.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
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
import {
  bulkCreateAccounts,
  createAccount,
  deleteAccount,
  disableAccount,
  enableAccount,
  forceRelease,
  getAdminAccounts,
  markAvailable,
  renameAccount,
  resetPassword,
} from '@/api/admin'
import { STATUS_META, toStatusKind } from '@/lib/status'
import { accountsCsvTemplate, parseAccountsCsv } from '@/lib/csv'

const router = useRouter()

const loading = ref(true)
const error = ref('')
const availability = ref({ total: 0, available: 0, inUse: 0, recycling: 0, error: 0 })
const pool = ref([])
const hasActiveLease = ref(false)
const claiming = ref(false)

const PAGE_SIZE = 6
const page = ref(1)

let pollTimer

/** 统一为卡片模型：公开池只有 code/status/estimatedReleaseAt；管理员视图额外含 id/enabled/username。 */
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

const totalPages = computed(() => Math.max(1, Math.ceil(pool.value.length / PAGE_SIZE)))
const pagedCards = computed(() => pool.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
watch(pool, () => {
  if (page.value > totalPages.value) page.value = totalPages.value
})

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

// ---------------------------------------------------------------------------
// 管理员动作（仅 isAdmin 可见）
// ---------------------------------------------------------------------------
async function act(card, fn, okMsg) {
  if (card.id == null) return
  try {
    await fn(card.id)
    toast({ title: okMsg, variant: 'success' })
    await load()
  } catch (e) {
    toast({ title: e?.message || '操作失败', variant: 'destructive' })
  }
}

const onForceRelease = (c) => act(c, forceRelease, '已强制回收')
const onMarkAvailable = (c) => act(c, markAvailable, '已标记为可用')
const onDisable = (c) => act(c, disableAccount, '已禁用')
const onEnable = (c) => act(c, enableAccount, '已启用')

// 重置密码（二次确认，避免误触：将立即踢出当前会话并回收，新密码由系统托管）
const resetOpen = ref(false)
const resetTarget = ref(null)
function onReset(card) {
  resetTarget.value = card
  resetOpen.value = true
}
async function doReset() {
  const card = resetTarget.value
  if (card?.id == null) return
  try {
    await resetPassword(card.id)
    toast({ title: `已发起重置 ${card.code}`, description: '系统将自动完成科应改密，账号回到可用后可被领取', variant: 'success' })
    resetOpen.value = false
    await load()
  } catch (e) {
    toast({ title: e?.message || '操作失败', variant: 'destructive' })
  }
}

// 新增 / 编辑
const createOpen = ref(false)
const createForm = ref({ code: '', username: '' })
const editOpen = ref(false)
const editTarget = ref(null)
const editForm = ref({ code: '', username: '' })

function openEdit(card) {
  editTarget.value = card
  editForm.value = { code: card.code, username: card.username }
  editOpen.value = true
}

// openAccount 判断是否是管理员，管理员 跳转 /admin/accounts
// 注意：路由仅注册了 /admin/accounts（账号管理列表），没有 /admin/accounts/:id 详情页，
// 跳 :id 会因无匹配路由而“点了没反应”。故跳转列表页；如需定位到具体账号可后续加 ?focus= 支持。
function openAccount(card) {
  if (isAdmin.value && card?.id != null) {
    router.push('/admin/accounts')
  } else {
    return false
  }
}


async function saveCreate() {
  if (!createForm.value.code.trim() || !createForm.value.username.trim()) return
  try {
    await createAccount({ code: createForm.value.code.trim(), username: createForm.value.username.trim() })
    toast({ title: `已新增 ${createForm.value.code}`, variant: 'success' })
    createOpen.value = false
    createForm.value = { code: '', username: '' }
    await load()
  } catch (e) {
    toast({ title: e?.message || '新增失败', variant: 'destructive' })
  }
}

async function saveEdit() {
  if (!editTarget.value) return
  try {
    await renameAccount(editTarget.value.id, { username: editForm.value.username.trim() })
    toast({ title: '已保存', variant: 'success' })
    editOpen.value = false
    await load()
  } catch (e) {
    toast({ title: e?.message || '保存失败', variant: 'destructive' })
  }
}

// 删除
const deleteOpen = ref(false)
const deleteTarget = ref(null)
function confirmDelete(card) {
  deleteTarget.value = card
  deleteOpen.value = true
}
async function doDelete() {
  if (!deleteTarget.value?.id) return
  try {
    await deleteAccount(deleteTarget.value.id)
    toast({ title: `已删除 ${deleteTarget.value.code}`, variant: 'success' })
    deleteOpen.value = false
    await load()
  } catch (e) {
    toast({ title: e?.message || '删除失败', variant: 'destructive' })
  }
}

// CSV 导入（解析交互与用户新增一致：上传 → 预览 → 二次确认）
const importOpen = ref(false)
const importFileRef = ref(null)
const importRows = ref([])
const importFailed = ref([])

function triggerImportFile() {
  importFileRef.value?.click()
}
function downloadAccountTemplate() {
  const blob = new Blob([accountsCsvTemplate()], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'accounts-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}
async function onImportFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const text = await file.text()
  const { rows, headerErrors } = parseAccountsCsv(text)
  if (headerErrors.length) {
    toast({ title: headerErrors.join('；'), variant: 'destructive' })
    importRows.value = []
    importFailed.value = []
  } else {
    importRows.value = rows
      .filter((r) => r.errors.length === 0)
      .map((r) => ({ index: r.index, code: r.code, username: r.username }))
    importFailed.value = rows
      .filter((r) => r.errors.length > 0)
      .map((r) => ({ index: r.index, code: r.code, username: r.username, errors: r.errors }))
  }
  e.target.value = ''
}
async function confirmImport() {
  if (importRows.value.length === 0) return
  try {
    const res = await bulkCreateAccounts(importRows.value.map((r) => ({ code: r.code, username: r.username })))
    const created = res?.created ?? importRows.value.length
    const failed = res?.failed ?? []
    toast({
      title: `已导入 ${created} 条${failed.length ? `，${failed.length} 条失败` : ''}`,
      variant: failed.length ? 'default' : 'success',
    })
    importOpen.value = false
    importRows.value = []
    importFailed.value = []
    await load()
  } catch (e) {
    toast({ title: e?.message || '导入失败', variant: 'destructive' })
  }
}
</script>

<template>
  <PublicLayout>
    <!--
      页面栈：统一垂直留白节奏（gap-6），由 .app-main 负责内容稀少时垂直居中。
      不再自带 max-w/px/py —— 这些交给 .page-container，保证大屏居中、小屏不贴边。
    -->
    <div class="flex flex-col gap-4 py-4 sm:py-5">
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
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-2 sm:p-4">
          <h2 class="text-base font-semibold leading-6 text-ink">账号池</h2>
          <div class="flex flex-wrap items-center gap-2">
            <template v-if="isAdmin">
              <Button size="sm" @click="createOpen = true">新增账号</Button>
              <Button size="sm" variant="outline" @click="importOpen = true">导入 CSV</Button>
            </template>
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
            暂无科应账号，<template v-if="isAdmin">点击右上角「新增账号」录入。</template><template v-else>请联系管理员录入。</template>
          </p>

          <!-- 卡片网格：一页 6 个（3×2） -->
          <template v-else>
            <div class="grid grid-cols-1 gap-3 py-3 sm:grid-cols-3">
              <div
                v-for="card in pagedCards"
                :key="card.id ?? card.code"
                class="account-card flex flex-col rounded-2xl p-4 shadow-sm cursor-pointer"
                :class="[!card.enabled ? 'opacity-60' : '', cardVisual(card).recycling ? 'is-recycling' : '']"
                :style="cardStyle(card)"
                @click="openAccount(card)"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="w-100 flex min-w-0 items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-ink">{{ card.code }}</div>
                      <div v-if="isAdmin && card.username" class="truncate text-xs text-mid-gray">{{ card.username }}</div>
                    </div>
                    <StatusDot :status="card.status" :label="card.enabled ? '' : '已禁用'" />
                  </div>
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
                  <template v-else>已释放</template>
                </div>

                <!-- 管理员动作 -->
                <div v-if="isAdmin" class="mt-3 flex flex-wrap gap-1.5">
                  <Button v-if="card.status === 'in_use' && card.enabled" size="sm" variant="outline" @click="onForceRelease(card)">强制回收</Button>
                  <Button v-if="card.status === 'error' && card.enabled" size="sm" variant="outline" @click="onMarkAvailable(card)">标记可用</Button>
                  <Button v-if="card.enabled" size="sm" variant="outline" @click="onReset(card)">重置密码</Button>
                  <Button v-if="card.enabled" size="sm" variant="outline" @click="openEdit(card)">编辑</Button>
                  <Button v-if="card.enabled" size="sm" variant="outline" @click="onDisable(card)">禁用</Button>
                  <Button v-else size="sm" variant="outline" @click="onEnable(card)">启用</Button>
                  <Button v-if="card.enabled" size="sm" variant="outline" class="text-ember" @click="confirmDelete(card)">删除</Button>
                </div>
              </div>
            </div>

            <!-- 分页条 -->
            <div
              v-if="pool.length > PAGE_SIZE"
              class="flex flex-wrap items-center justify-between gap-3 border-t border-hairline py-3 text-xs text-mid-gray"
            >
              <span>共 {{ pool.length }} 个账号</span>
              <div class="flex items-center gap-2">
                <Button variant="outline" size="sm" :disabled="page <= 1" @click="page--">上一页</Button>
                <span class="tabular-nums">{{ page }} / {{ totalPages }}</span>
                <Button variant="outline" size="sm" :disabled="page >= totalPages" @click="page++">下一页</Button>
              </div>
            </div>
          </template>
        </div>
      </Card>
    </div>

    <!-- 重置密码确认 -->
    <Dialog
      :open="resetOpen"
      title="重置密码"
      :description="`将重置「${resetTarget?.code ?? ''}${resetTarget?.username ? `（${resetTarget.username}）` : ''}」的科应密码并回收其活动租约：立即踢出当前会话，由系统生成新密码并自动在科应后台完成改密，之后账号回到可用。确认继续？`"
      @update:open="(v) => (resetOpen = v)"
    >
      <template #footer>
        <Button variant="outline" @click="resetOpen = false">取消</Button>
        <Button @click="doReset">确认重置</Button>
      </template>
    </Dialog>

    <!-- 新增账号 -->
    <Dialog :open="createOpen" title="新增科应账号" @update:open="(v) => (createOpen = v)">
      <div class="space-y-3">
        <div>
          <Label>账号编号</Label>
          <Input v-model="createForm.code" placeholder="如 KY-11" />
        </div>
        <div>
          <Label>科应账号</Label>
          <Input v-model="createForm.username" placeholder="如 ky-11" />
        </div>
        <p class="text-xs text-mid-gray">密码由系统以占位密文托管，创建后管理员可经「重置密码」生成真实密码。</p>
      </div>
      <template #footer>
        <Button variant="outline" @click="createOpen = false">取消</Button>
        <Button :disabled="!createForm.code.trim() || !createForm.username.trim()" @click="saveCreate">创建</Button>
      </template>
    </Dialog>

    <!-- 编辑账号 -->
    <Dialog :open="editOpen" title="编辑科应账号" @update:open="(v) => (editOpen = v)">
      <div class="space-y-3">
        <div>
          <Label>账号编号</Label>
          <Input :model-value="editForm.code" disabled />
        </div>
        <div>
          <Label>科应账号</Label>
          <Input v-model="editForm.username" placeholder="如 ky-11" />
        </div>
      </div>
      <template #footer>
        <Button variant="outline" @click="editOpen = false">取消</Button>
        <Button :disabled="!editForm.username.trim()" @click="saveEdit">保存</Button>
      </template>
    </Dialog>

    <!-- 删除确认 -->
    <Dialog
      :open="deleteOpen"
      title="删除账号"
      destructive
      :description="`确认删除「${deleteTarget?.code ?? ''}${deleteTarget?.username ? `（${deleteTarget.username}）` : ''}」？该操作不可撤销，相关租约与审计记录一并清除。`"
      @update:open="(v) => (deleteOpen = v)"
    >
      <template #footer>
        <Button variant="outline" @click="deleteOpen = false">取消</Button>
        <Button variant="destructive" @click="doDelete">删除</Button>
      </template>
    </Dialog>

    <!-- 导入 CSV -->
    <Dialog :open="importOpen" title="导入科应账号（CSV）" @update:open="(v) => (importOpen = v)">
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" @click="triggerImportFile">选择 CSV 文件</Button>
          <Button variant="ghost" size="sm" @click="downloadAccountTemplate">下载模板</Button>
          <input ref="importFileRef" type="file" accept=".csv,text/csv" class="hidden" @change="onImportFile" />
        </div>
        <p class="text-xs text-mid-gray">必需列：账号编号、科应账号。密码由系统托管，导入后管理员可经「重置密码」生成。</p>

        <template v-if="importRows.length || importFailed.length">
          <div class="max-h-48 overflow-auto rounded-lg border border-hairline">
            <div
              v-for="r in importRows"
              :key="'ok' + r.index"
              class="flex items-center justify-between gap-2 border-b border-hairline px-3 py-1.5 text-xs"
            >
              <span class="font-medium">{{ r.code }}</span>
              <span class="text-mid-gray">{{ r.username }}</span>
              <span class="text-green-600">可导入</span>
            </div>
            <div
              v-for="r in importFailed"
              :key="'bad' + r.index"
              class="flex items-center justify-between gap-2 border-b border-hairline px-3 py-1.5 text-xs"
            >
              <span class="font-medium">{{ r.code || '(空)' }}</span>
              <span class="text-mid-gray">{{ r.username || '' }}</span>
              <span class="text-ember">{{ r.errors.join('；') }}</span>
            </div>
          </div>
          <p class="text-xs" :class="importFailed.length ? 'text-ember' : 'text-mid-gray'">
            可导入 {{ importRows.length }} 条，跳过 {{ importFailed.length }} 条
          </p>
        </template>
      </div>
      <template #footer>
        <Button variant="outline" @click="importOpen = false">取消</Button>
        <Button :disabled="importRows.length === 0" @click="confirmImport">导入 {{ importRows.length }} 条</Button>
      </template>
    </Dialog>
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
