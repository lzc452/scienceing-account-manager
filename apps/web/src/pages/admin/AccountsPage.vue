<script setup>
import { computed, onMounted, ref } from 'vue'
import AdminLayout from '@/layouts/AdminLayout.vue'
import ErrorCard from '@/components/admin/ErrorCard.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Dialog from '@/components/ui/Dialog.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Table from '@/components/ui/Table.vue'
import TableBody from '@/components/ui/TableBody.vue'
import TableCell from '@/components/ui/TableCell.vue'
import TableHead from '@/components/ui/TableHead.vue'
import TableHeader from '@/components/ui/TableHeader.vue'
import TableRow from '@/components/ui/TableRow.vue'
import { toast } from '@/components/ui/toast'
import {
  bulkCreateAccounts,
  createAccount,
  deleteAccount,
  disableAccount,
  enableAccount,
  forceRelease,
  getAdminAccounts,
  markAvailable,
  renameAccount as renameAccountApi,
  resetPassword,
} from '@/api/admin'
import { toStatusKind } from '@/lib/status'
import { accountsCsvTemplate } from '@/lib/csv'
import {
  SPREADSHEET_ACCEPT,
  SPREADSHEET_EXTENSIONS,
  aoaToWorkbookBytes,
  isSpreadsheetFile,
  parseAccountsFile,
} from '@/lib/spreadsheet'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
/** 科应账号表格模板（CSV / XLSX 共用列名约定）。 */
const ACCOUNT_TEMPLATE_AOA = [
  ['账号编号', '科应账号'],
  ['KY-11', 'ky-11'],
  ['KY-12', 'ky-12'],
]

const loading = ref(true)
const error = ref('')
const accounts = ref([])
const pending = ref(false)
const dialog = ref(null) // { type, account }

// 改名表单（Bug1：支持修改账号名称，对应科应平台账号）
const renameOpen = ref(false)
const renameTarget = ref(null)
const renameValue = ref('')

// 重置密码时选中的账号 id（默认为点击行，可切换）
const resetTargetId = ref(null)
const resetTarget = computed(() => accounts.value.find((a) => a.id === resetTargetId.value) ?? null)
const accountOptions = computed(() =>
  accounts.value.map((a) => ({ value: a.id, label: `${a.code} · ${a.username}` })),
)

const errorAccounts = computed(() => accounts.value.filter((a) => a.status === 'ERROR'))

// ---------------------------------------------------------------------------
// 新增账号 / 删除账号 / CSV 导入（从首页账号池迁移至本页，功能一致）
// ---------------------------------------------------------------------------
const createOpen = ref(false)
const createForm = ref({ code: '', username: '' })

const deleteTarget = ref(null)
const deleteOpen = ref(false)
function confirmDelete(account) {
  deleteTarget.value = account
  deleteOpen.value = true
}
async function doDelete() {
  if (!deleteTarget.value?.id) return
  pending.value = true
  try {
    await deleteAccount(deleteTarget.value.id)
    toast({ title: `已删除 ${deleteTarget.value.code}`, variant: 'success' })
    deleteOpen.value = false
    load()
  } catch (e) {
    toast({ title: e?.message || '删除失败', variant: 'destructive' })
  } finally {
    pending.value = false
  }
}

async function saveCreate() {
  if (!createForm.value.code.trim() || !createForm.value.username.trim()) return
  pending.value = true
  try {
    await createAccount({ code: createForm.value.code.trim(), username: createForm.value.username.trim() })
    toast({ title: `已新增 ${createForm.value.code}`, variant: 'success' })
    createOpen.value = false
    createForm.value = { code: '', username: '' }
    load()
  } catch (e) {
    toast({ title: e?.message || '新增失败', variant: 'destructive' })
  } finally {
    pending.value = false
  }
}

// CSV / XLSX 导入（解析交互与用户导入一致：上传 → 预览 → 二次确认）
const importOpen = ref(false)
const importFileRef = ref(null)
const importRows = ref([])
const importFailed = ref([])
const importResult = ref(null) // { created, failedCount } —— 非空表示本轮已出结果，禁止重复提交

/** 触发浏览器下载（a 需入 DOM 且延后 revoke，否则部分浏览器会中断下载）。data 为字符串(CSV)或字节(XLSX)。 */
function downloadBlob(filename, data, type) {
  const isBinary = typeof data !== 'string'
  const blob = isBinary
    ? new Blob([data], { type })
    : new Blob(['\uFEFF' + data], { type: type || 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function onImportDialogToggle(open) {
  importOpen.value = open
  if (!open) {
    importRows.value = []
    importFailed.value = []
    importResult.value = null
  }
}

function triggerImportFile() {
  importFileRef.value?.click()
}
function downloadAccountTemplate() {
  downloadBlob('科应账号导入模板.csv', accountsCsvTemplate())
}

/** 下载 xlsx 模板：与解析共用同一份 vendored SheetJS 生成，保证读得回。 */
async function downloadAccountXlsxTemplate() {
  try {
    const bytes = await aoaToWorkbookBytes(ACCOUNT_TEMPLATE_AOA, '账号模板')
    downloadBlob('科应账号导入模板.xlsx', bytes, XLSX_MIME)
  } catch (e) {
    toast({ title: e?.message || '模板生成失败', variant: 'destructive' })
  }
}

async function onImportFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (!isSpreadsheetFile(file.name)) {
    toast({ title: `仅支持 ${SPREADSHEET_EXTENSIONS.join(' / ')} 文件`, variant: 'destructive' })
    return
  }
  // 重新选文件即开启新一轮：清掉上一轮结果，避免新旧预览/结果混在一起
  importResult.value = null
  let result
  try {
    result = await parseAccountsFile(file)
  } catch (err) {
    toast({ title: err?.message || '文件解析失败', variant: 'destructive' })
    return
  }
  const { rows, headerErrors } = result
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
}

async function confirmImport() {
  if (importResult.value || importRows.value.length === 0) return
  pending.value = true
  try {
    const res = await bulkCreateAccounts(importRows.value.map((r) => ({ code: r.code, username: r.username })))
    const created = res?.created ?? 0
    const failed = res?.failed ?? []
    toast({
      title: `已导入 ${created} 条${failed.length ? `，${failed.length} 条失败` : ''}`,
      description: created > 0 ? '导入账号的密码为系统占位值，请执行「重置密码」生成真实密码后方可领用。' : undefined,
      variant: failed.length ? 'default' : 'success',
    })
    // 把后端失败原因回写到明细列表，成功行从待导入列表移除，杜绝重复提交
    const failedReason = new Map(failed.map((f) => [f.code, f.reason]))
    importFailed.value = [
      ...importFailed.value.filter((r) => !failedReason.has(r.code)),
      ...importRows.value
        .filter((r) => failedReason.has(r.code))
        .map((r) => ({ index: r.index, code: r.code, username: r.username, errors: [failedReason.get(r.code)] })),
    ]
    importRows.value = []
    importResult.value = { created, failedCount: failed.length }
    load()
    // 全部成功才自动关闭；有失败时保留弹窗展示明细（提交按钮此时已隐藏）
    if (failed.length === 0) importOpen.value = false
  } catch (e) {
    toast({ title: e?.message || '导入失败', variant: 'destructive' })
  } finally {
    pending.value = false
  }
}

async function load() {
  try {
    accounts.value = await getAdminAccounts()
    error.value = ''
  } catch (e) {
    error.value = e?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

const dialogMeta = computed(() => {
  if (!dialog.value) return null
  // 将重置 {{ resetTarget.code }}（{{ resetTarget.username }}）的密码并回收其活动租约。
  const { type, account } = dialog.value
  if (type === 'force-release') {
    return { title: `强制回收 ${account.code}`, description: '将重置密码并立即退出当前使用人的科应会话。', destructive: true, confirm: '确认回收' }
  }
  if (type === 'reset-password') {
    return { title: '重置密码', description: '', destructive: false, confirm: '确认重置' }
  }
  if (type === 'disable') {
    return { title: `禁用账号 ${account.code}`, description: '禁用后该账号不可再被领取；若有活动租约将一并回收。', destructive: true, confirm: '确认禁用' }
  }
  if (type === 'mark-available') {
    return { title: `标记可用 ${account.code}`, description: '确认人工处理已完成，账号将回到可用状态。', destructive: false, confirm: '确认' }
  }
  if (type === 'enable') {
    return { title: `启用账号 ${account.code}`, description: '启用后该账号可被重新领取。', destructive: false, confirm: '确认启用' }
  }
  return null
})

function openDialog(type, account) {
  dialog.value = { type, account }
  if (type === 'reset-password') resetTargetId.value = account.id
}

function openRename(account) {
  renameTarget.value = account
  renameValue.value = account.username
  renameOpen.value = true
}

async function onRenameSubmit() {
  const name = renameValue.value.trim()
  if (!name) {
    toast({ title: '账号名称不能为空', variant: 'destructive' })
    return
  }
  pending.value = true
  try {
    await renameAccountApi(renameTarget.value.id, { username: name })
    toast({ title: '账号名称已更新', description: `${renameTarget.value.code} → ${name}`, variant: 'success' })
    renameOpen.value = false
    load()
  } catch (e) {
    toast({ title: e?.message || '修改失败', variant: 'destructive' })
  } finally {
    pending.value = false
  }
}

async function onConfirm() {
  const { type } = dialog.value
  pending.value = true
  try {
    if (type === 'force-release') await forceRelease(dialog.value.account.id)
    else if (type === 'reset-password') await resetPassword(resetTargetId.value)
    else if (type === 'disable') await disableAccount(dialog.value.account.id)
    else if (type === 'mark-available') await markAvailable(dialog.value.account.id)
    else if (type === 'enable') await enableAccount(dialog.value.account.id)
    toast({ title: '操作已提交', description: '状态已更新', variant: 'success' })
    dialog.value = null
    load()
  } catch (e) {
    toast({ title: e?.message || '操作失败', variant: 'destructive' })
  } finally {
    pending.value = false
  }
}

function onRetry(account) {
  openDialog('reset-password', account)
}

async function onFix(account) {
  pending.value = true
  try {
    await markAvailable(account.id)
    toast({ title: `${account.code} 已标记可用`, variant: 'success' })
    load()
  } catch (e) {
    toast({ title: e?.message || '操作失败', variant: 'destructive' })
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AdminLayout>
    <!-- 区块间距统一为 gap-6（= 24px），构成可预期的垂直节奏 -->
    <div class="flex flex-col gap-6">
      <!-- 标题 与「新增账号 / 导入 CSV」按钮 justify-between（自首页账号池迁移） -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl font-semibold leading-7 tracking-normal text-ink sm:text-2xl sm:leading-8">
          科应账号管理
        </h1>
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="outline" @click="importOpen = true">导入表格</Button>
          <Button @click="createOpen = true">新增账号</Button>
        </div>
      </div>

      <!-- ERROR 账号置顶错误卡片 -->
      <div v-if="errorAccounts.length" class="flex flex-col gap-3">
        <ErrorCard
          v-for="account in errorAccounts"
          :key="account.id"
          :account-code="account.code"
          error-text="改密失败：科应后台未能完成重置（Worker 已自动重试），可重试；若已人工处理完成请标记可用。"
          @retry="onRetry(account)"
          @fix="onFix(account)"
        />
      </div>

      <!--
        表格卡片：overflow-hidden 让卡片圆角裁剪表格；
        操作列最多 4 个按钮，故把「舒适最小宽度」设为 880px——
        窄于它时在卡片内部横向滚动，页面本身不产生横向滚动条。
      -->
      <Card class="overflow-hidden">
        <Table min-width="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead>账号</TableHead>
              <TableHead>科应账号</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>使用者</TableHead>
              <TableHead>最后改密</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="loading">
              <TableRow v-for="i in 5" :key="i">
                <TableCell colspan="6"><Skeleton class="h-6 w-full" /></TableCell>
              </TableRow>
            </template>
            <template v-else-if="error">
              <TableRow>
                <TableCell colspan="6" class="py-6 text-center text-mid-gray">
                  {{ error }}
                  <Button variant="outline" size="sm" class="ml-3" @click="load">重试</Button>
                </TableCell>
              </TableRow>
            </template>
            <template v-else>
              <TableRow v-for="account in accounts" :key="account.id" :class="!account.enabled && 'opacity-50'">
                <TableCell class="font-medium tabular-nums">{{ account.code }}</TableCell>
                <TableCell>
                  <div class="flex items-center gap-2">
                    <span class="text-mid-gray">{{ account.username }}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div class="flex items-center gap-2">
                    <Badge :tone="toStatusKind(account.status)" />
                    <span
                      v-if="!account.passwordProvisioned"
                      class="cursor-help whitespace-nowrap rounded-full border border-hairline px-2 py-0.5 text-xs text-mid-gray"
                      title="密码尚未初始化（seed / 导入占位）。请先执行「重置密码」在科应后台生成真实密码，否则该账号无法被领用。"
                    >
                      待改密
                    </span>
                  </div>
                </TableCell>
                <TableCell :class="account.currentUser ? 'text-ink' : 'text-mid-gray'">
                  {{ account.currentUser || '—' }}
                </TableCell>
                <TableCell class="tabular-nums text-mid-gray">{{ formatDate(account.lastPasswordChangedAt) }}</TableCell>
                <TableCell>
                  <!-- whitespace-nowrap：操作按钮不换行，宽度不足时由表格内部滚动承接 -->
                  <div class="flex items-center justify-end gap-2 whitespace-nowrap">
                    <template v-if="account.status === 'RECYCLING'">
                      <span class="text-xs text-mid-gray">—</span>
                    </template>
                    <template v-else>
                      <Button
                        v-if="account.status === 'IN_USE'"
                        variant="destructive"
                        size="sm"
                        @click="openDialog('force-release', account)"
                      >
                        强制回收
                      </Button>
                      <Button
                        v-if="account.status !== 'RECYCLING'"
                        variant="ghost"
                        size="sm"
                        @click="openDialog('reset-password', account)"
                      >
                        重置密码
                      </Button>
                      <Button
                        v-if="account.status === 'ERROR'"
                        variant="ghost"
                        size="sm"
                        @click="openDialog('mark-available', account)"
                      >
                        标记可用
                      </Button>
                      <button
                        variant="ghost"
                        size="sm"
                        @click="openRename(account)"
                      >
                        编辑
                      </button>
                      <Button
                        v-if="account.enabled"
                        variant="ghost"
                        size="sm"
                        class="text-ember hover:bg-status-error-soft hover:text-ember"
                        @click="openDialog('disable', account)"
                      >
                        禁用
                      </Button>
                      <Button
                        v-else
                        variant="ghost"
                        size="sm"
                        @click="openDialog('enable', account)"
                      >
                        启用
                      </Button>
                      <Button
                        v-if="account.enabled"
                        variant="ghost"
                        size="sm"
                        class="text-ember hover:bg-status-error-soft hover:text-ember"
                        @click="confirmDelete(account)"
                      >
                        删除
                      </Button>
                    </template>
                  </div>
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </Card>
    </div>

    <Dialog
      :open="dialog !== null"
      :title="dialogMeta?.title"
      :description="dialogMeta?.description"
      :destructive="dialogMeta?.destructive"
      @update:open="dialog = null"
    >
      <div v-if="dialog?.type === 'reset-password'" class="flex flex-col gap-2">
        <p>此操作将重置所选 {{resetTarget.code}} 账号的密码；</p>
        <p>科应账号 {{resetTarget.username}} 的会话将会回收，由系统生成新密码并在科应后台自动完成改密。</p>
      </div>
      <template #footer>
        <Button variant="outline" @click="dialog = null">取消</Button>
        <Button
          :variant="dialogMeta?.destructive ? 'destructive' : 'default'"
          :disabled="pending"
          @click="onConfirm"
        >
          {{ pending ? '处理中…' : dialogMeta?.confirm }}
        </Button>
      </template>
    </Dialog>

    <!-- 修改账号名称（对应科应平台账号） -->
    <Dialog
      :open="renameOpen"
      :title="`修改账号名称 ${renameTarget?.code ?? ''}`"
      description="账号名称对应科应平台账号，重置密码等自动化流程依据该名称定位账号。"
      @update:open="renameOpen = false"
    >
      <form class="flex flex-col gap-4" @submit.prevent="onRenameSubmit">
        <div>
          <Label>账号名称</Label>
          <Input v-model="renameValue" placeholder="例如 ky-01" class="mt-1.5" />
        </div>
      </form>
      <template #footer>
        <Button variant="outline" @click="renameOpen = false">取消</Button>
        <Button :disabled="pending" @click="onRenameSubmit">
          {{ pending ? '保存中…' : '保存' }}
        </Button>
      </template>
    </Dialog>

    <!-- 新增科应账号 -->
    <Dialog :open="createOpen" title="新增科应账号" @update:open="(v) => (createOpen = v)">
      <div class="space-y-3">
        <div>
          <Label>账号编号</Label>
          <Input v-model="createForm.code" placeholder="如 KY-11" class="mt-1.5" />
        </div>
        <div>
          <Label>科应账号</Label>
          <Input v-model="createForm.username" placeholder="如 ky-11" class="mt-1.5" />
        </div>
        <p class="text-xs text-mid-gray">密码由系统以占位密文托管，创建后管理员可经「重置密码」生成真实密码。</p>
      </div>
      <template #footer>
        <Button variant="outline" @click="createOpen = false">取消</Button>
        <Button :disabled="pending || !createForm.code.trim() || !createForm.username.trim()" @click="saveCreate">
          {{ pending ? '创建中…' : '创建' }}
        </Button>
      </template>
    </Dialog>

    <!-- 删除确认 -->
    <Dialog
      :open="deleteOpen"
      title="删除账号"
      destructive
      :description="`确认删除「${deleteTarget?.code ?? ''}${deleteTarget?.username ? `（${deleteTarget.username}）` : ''}」？该操作不可撤销，相关租约与审计记录一并清除。`"
      @update:open="deleteOpen = false"
    >
      <template #footer>
        <Button variant="outline" @click="deleteOpen = false">取消</Button>
        <Button variant="destructive" :disabled="pending" @click="doDelete">
          {{ pending ? '删除中…' : '删除' }}
        </Button>
      </template>
    </Dialog>

    <!-- 导入表格（CSV / XLSX：上传 → 解析预览 → 二次确认） -->
    <Dialog :open="importOpen" title="导入科应账号（CSV / XLSX）" @update:open="onImportDialogToggle">
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" @click="triggerImportFile">选择文件</Button>
          <Button variant="ghost" size="sm" @click="downloadAccountTemplate">下载CSV模板</Button>
          <Button variant="ghost" size="sm" @click="downloadAccountXlsxTemplate">下载XLSX模板</Button>
          <input ref="importFileRef" type="file" :accept="SPREADSHEET_ACCEPT" class="hidden" @change="onImportFile" />
        </div>
        <p class="text-xs text-mid-gray">必需列：账号编号、科应账号。支持 .csv / .xlsx（.xlsm / .xls），首行为列名。密码由系统托管，导入后管理员可经「重置密码」生成。</p>

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

        <p v-if="importResult && importResult.created > 0" class="text-xs text-mid-gray">
          已导入 {{ importResult.created }} 条。导入账号的密码为系统占位值，
          需逐个执行「重置密码」生成真实密码后方可领用。
        </p>
      </div>
      <template #footer>
        <Button variant="outline" @click="onImportDialogToggle(false)">
          {{ importResult ? '关闭' : '取消' }}
        </Button>
        <Button
          v-if="!importResult"
          :disabled="pending || importRows.length === 0"
          @click="confirmImport"
        >
          {{ pending ? '导入中…' : `导入 ${importRows.length} 条` }}
        </Button>
      </template>
    </Dialog>
  </AdminLayout>
</template>
