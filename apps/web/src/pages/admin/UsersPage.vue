<script setup>
import { computed, onMounted, ref } from 'vue'
import AdminLayout from '@/layouts/AdminLayout.vue'
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
import { bulkCreateUsers, createUser, getAdminUsers, resetUserPassword, updateUser, verifyAdminPassword } from '@/api/admin'
import { authState } from '@/api'
import { usersCsvTemplate } from '@/lib/csv'
import {
  SPREADSHEET_ACCEPT,
  SPREADSHEET_EXTENSIONS,
  SPREADSHEET_HINT,
  aoaToWorkbookBytes,
  isSpreadsheetFile,
  parseUsersFile,
} from '@/lib/spreadsheet'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
/** 用户表格模板（CSV 与 XLSX 共用同一套列名约定）。 */
const USER_TEMPLATE_AOA = [
  ['用户名', '姓名', '部门', '角色', '密码'],
  ['zhangsan', '张三', '研发部', 'USER', '初始密码123'],
  ['lisi', '李四', '产品部', 'USER', '初始密码456'],
]

const ROLE_OPTIONS = [
  { value: 'USER', label: 'USER' },
  { value: 'ADMIN', label: 'ADMIN' },
]

const loading = ref(true)
const error = ref('')
const users = ref([])
const pending = ref(false)

const formOpen = ref(false)
const formMode = ref('create')
const formUser = ref(null)
const form = ref({ username: '', displayName: '', department: '', role: 'USER', password: '' })

const confirm = ref(null) // { type: 'disable'|'enable', user }

// ── 表格批量导入（CSV / XLSX，上传 → 解析预览二次确认 → 批量创建） ──
const csvInputRef = ref(null)
const importOpen = ref(false) // 预览/确认弹窗
const importRows = ref([]) // 解析后的行
const importHeaderErrors = ref([])
const importing = ref(false)
const importResult = ref(null) // { created, failed: [] }

function pickCsv() {
  csvInputRef.value?.click()
}

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

function downloadTemplate() {
  downloadBlob('用户导入模板.csv', usersCsvTemplate())
}

/** 下载 xlsx 模板：与解析共用同一份 vendored SheetJS 生成，保证读得回。 */
async function downloadXlsxTemplate() {
  try {
    const bytes = await aoaToWorkbookBytes(USER_TEMPLATE_AOA, '用户模板')
    downloadBlob('用户导入模板.xlsx', bytes, XLSX_MIME)
  } catch (e) {
    toast({ title: e?.message || '模板生成失败', variant: 'destructive' })
  }
}

/**
 * 可提交的行。三个条件同时成立才可导入：
 *   1. 行本身无校验错误；
 *   2. 表头无缺列（缺列时字段为空，行级已报错，这里是双保险）；
 *   3. 本轮尚未出结果（importResult 非空）——导入后再放行会导致重复提交，
 *      第二次整批因「用户名已存在」失败，用户会误判为导入功能坏了。
 */
const importValidRows = computed(() =>
  importResult.value || importHeaderErrors.value.length
    ? []
    : importRows.value.filter((r) => r.errors.length === 0),
)

function onCsvFile(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // 允许重复选择同一文件
  if (!file) return
  if (!isSpreadsheetFile(file.name)) {
    toast({ title: `仅支持 ${SPREADSHEET_EXTENSIONS.join(' / ')} 文件`, variant: 'destructive' })
    return
  }
  parseUsersFile(file)
    .then(({ rows, headerErrors }) => {
      importHeaderErrors.value = headerErrors
      importRows.value = rows
      importResult.value = null
      if (rows.length === 0) {
        toast({
          title: '未解析到有效数据行',
          description: headerErrors.join('；') || undefined,
          variant: 'destructive',
        })
        return
      }
      importOpen.value = true
    })
    .catch((e) => toast({ title: e?.message || '文件解析失败', variant: 'destructive' }))
}

function onImportDialogToggle(open) {
  importOpen.value = open
  // 关闭时清空本轮上下文，避免下次打开残留上一次的预览与结果
  if (!open) {
    importRows.value = []
    importHeaderErrors.value = []
    importResult.value = null
  }
}

async function onImportConfirm() {
  if (importValidRows.value.length === 0) return
  importing.value = true
  try {
    const payload = importValidRows.value.map((r) => ({
      username: r.username,
      displayName: r.displayName,
      department: r.department,
      role: r.role,
      password: r.password,
    }))
    const res = await bulkCreateUsers(payload)
    // 把后端逐行结果回写到预览：成功行标「已导入」，失败行补上后端原因，
    // 让「预览」与「结果」对得上，而不是另起一段与列表无关的文字。
    const failedReason = new Map((res.failed ?? []).map((f) => [f.username, f.reason]))
    importRows.value = importRows.value.map((row) => {
      if (row.errors.length > 0) return row
      const reason = failedReason.get(row.username)
      return reason ? { ...row, errors: [reason] } : { ...row, imported: true }
    })
    importResult.value = res
    toast({
      title: `导入完成：成功 ${res.created} 个${res.failed.length ? `，失败 ${res.failed.length} 个` : ''}`,
      variant: res.failed.length ? 'default' : 'success',
    })
    load()
    // 全部成功才自动关闭；有失败时保留弹窗展示明细（此时提交按钮已禁用，不会重复提交）
    if (res.failed.length === 0) importOpen.value = false
  } catch (e) {
    toast({ title: e?.message || '导入失败', variant: 'destructive' })
  } finally {
    importing.value = false
  }
}

const currentUsername = computed(() => authState.user?.username)

async function load() {
  try {
    users.value = await getAdminUsers()
    error.value = ''
  } catch (e) {
    error.value = e?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function isSelf(user) {
  return user.username === currentUsername.value
}

function openCreate() {
  formMode.value = 'create'
  formUser.value = null
  form.value = { username: '', displayName: '', department: '', role: 'USER', password: '' }
  formOpen.value = true
}

function openEdit(user) {
  formMode.value = 'edit'
  formUser.value = user
  form.value = { username: user.username, displayName: user.displayName, department: user.department, role: user.role, password: '' }
  formOpen.value = true
}

async function onFormSubmit() {
  if (formMode.value === 'create') {
    if (!form.value.username || !form.value.displayName || !form.value.password) {
      toast({ title: '请填写用户名、姓名与初始密码', variant: 'destructive' })
      return
    }
  }
  pending.value = true
  try {
    if (formMode.value === 'create') {
      await createUser({
        username: form.value.username,
        displayName: form.value.displayName,
        department: form.value.department,
        role: form.value.role,
        password: form.value.password,
      })
      toast({ title: '已创建用户', variant: 'success' })
    } else {
      await updateUser(formUser.value.id, {
        displayName: form.value.displayName,
        department: form.value.department,
        role: form.value.role,
      })
      toast({ title: '已保存', variant: 'success' })
    }
    formOpen.value = false
    load()
  } catch (e) {
    toast({ title: e?.message || '操作失败', variant: 'destructive' })
  } finally {
    pending.value = false
  }
}

// ── 重置用户密码：两段式（先验证当前管理员密码 → 再设置新密码） ──
// 需求：管理员重置用户密码前必须自证当前密码。验证通过后拿到 HMAC 短时票据
// （verifyToken，5 分钟），第二步提交新密码时一并携带，后端校验票据后才执行，
// 避免「验证归验证、提交归提交」被无验证请求绕过。
const resetTarget = ref(null) // { id, username }
const verifyOpen = ref(false) // 第一步：安全验证弹窗
const verifyPassword = ref('')
const verifyBusy = ref(false)
const verifyError = ref('')
const verifyToken = ref('')
const resetOpen = ref(false) // 第二步：设置新密码弹窗
const newPassword = ref('')
const resetBusy = ref(false)
const resetResult = ref(false) // 本轮是否已成功（关闭时重置）

function openReset(user) {
  resetTarget.value = { id: user.id, username: user.username }
  verifyPassword.value = ''
  verifyError.value = ''
  verifyToken.value = ''
  newPassword.value = ''
  resetResult.value = false
  verifyOpen.value = true
}

async function onVerifySubmit() {
  if (!verifyPassword.value) {
    verifyError.value = '请输入当前管理员密码'
    return
  }
  verifyBusy.value = true
  verifyError.value = ''
  try {
    const res = await verifyAdminPassword(verifyPassword.value)
    verifyToken.value = res.verifyToken
    verifyOpen.value = false
    resetOpen.value = true
  } catch (e) {
    verifyError.value = e?.message || '验证失败，请重试'
  } finally {
    verifyBusy.value = false
  }
}

async function onResetSubmit() {
  const pwd = newPassword.value
  if (!pwd) {
    toast({ title: '请输入新密码', variant: 'destructive' })
    return
  }
  if (pwd.length < 8 || pwd.length > 72) {
    toast({ title: '新密码长度需在 8–72 个字符之间', variant: 'destructive' })
    return
  }
  resetBusy.value = true
  try {
    await resetUserPassword(resetTarget.value.id, pwd, verifyToken.value)
    resetResult.value = true
    toast({ title: `已重置 ${resetTarget.value.username} 的密码，请转告用户`, variant: 'success' })
    load()
    // 稍作停留展示成功态后关闭（resetResult 仅用于界面反馈，不承载流程状态）
    window.setTimeout(() => {
      resetOpen.value = false
      resetResult.value = false
    }, 600)
  } catch (e) {
    toast({ title: e?.message || '重置失败', variant: 'destructive' })
    // 票据失效（超时 / 过期）→ 回到第一步重新验证
    if (e?.status === 401) {
      resetOpen.value = false
      verifyOpen.value = true
      verifyError.value = '安全验证已失效，请重新输入当前管理员密码'
    }
  } finally {
    resetBusy.value = false
  }
}

function openToggle(user) {
  confirm.value = { type: user.enabled ? 'disable' : 'enable', user }
}

async function onToggleConfirm() {
  const { type, user } = confirm.value
  pending.value = true
  try {
    await updateUser(user.id, { enabled: type === 'enable' })
    toast({ title: type === 'disable' ? '已禁用用户' : '已启用用户', variant: 'success' })
    confirm.value = null
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
    <div class="flex flex-col gap-6">
      <!-- 标题行：窄屏纵向堆叠（标题在上、操作在下），宽屏回到左右对齐 -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl font-semibold leading-7 tracking-normal text-ink sm:text-2xl sm:leading-8">
          用户管理
        </h1>
        <div class="flex items-center gap-2">
          <Button variant="outline" @click="downloadTemplate">下载模板</Button>
          <Button variant="outline" @click="downloadXlsxTemplate">XLSX模板</Button>
          <Button variant="outline" @click="pickCsv">导入表格</Button>
          <Button @click="openCreate">创建用户</Button>
        </div>
      </div>
      <!-- 隐藏的文件选择器：导入表格按钮触发（支持 .csv / .xlsx / .xlsm / .xls） -->
      <input
        ref="csvInputRef"
        type="file"
        :accept="SPREADSHEET_ACCEPT"
        class="hidden"
        @change="onCsvFile"
      />

      <!-- 六列 + 三个操作按钮，舒适最小宽度 840px，溢出在卡片内部滚动 -->
      <Card class="overflow-hidden">
        <Table min-width="min-w-[840px]">
          <TableHeader>
            <TableRow>
              <TableHead>用户名</TableHead>
              <TableHead>姓名</TableHead>
              <TableHead>部门</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>状态</TableHead>
              <TableHead class="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="loading">
              <TableRow v-for="i in 4" :key="i">
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
              <TableRow v-for="user in users" :key="user.id">
                <TableCell class="font-medium">{{ user.username }}</TableCell>
                <TableCell>{{ user.displayName }}</TableCell>
                <TableCell class="text-mid-gray">{{ user.department || '—' }}</TableCell>
                <TableCell>
                  <Badge variant="soft">{{ user.role }}</Badge>
                </TableCell>
                <TableCell>
                  <Badge v-if="user.enabled" tone="available">启用</Badge>
                  <Badge v-else variant="outline">停用</Badge>
                </TableCell>
                <TableCell>
                  <div class="flex items-center justify-end gap-2 whitespace-nowrap">
                    <Button variant="ghost" size="sm" @click="openEdit(user)">编辑</Button>
                    <Button variant="ghost" size="sm" @click="openReset(user)">重置密码</Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      :class="user.enabled ? 'text-ember hover:bg-status-error-soft hover:text-ember' : ''"
                      :disabled="isSelf(user)"
                      @click="openToggle(user)"
                    >
                      {{ user.enabled ? '禁用' : '启用' }}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </Card>
    </div>

    <!-- 创建 / 编辑用户（密码重置已独立为「安全验证 → 设置新密码」两段式流程） -->
    <Dialog
      :open="formOpen"
      :title="formMode === 'create' ? '创建用户' : '编辑用户'"
      @update:open="formOpen = false"
    >
      <form class="flex flex-col gap-4" @submit.prevent="onFormSubmit">
        <template v-if="formMode === 'create'">
          <div>
            <Label>用户名</Label>
            <Input v-model="form.username" placeholder="例如 zhangsan" class="mt-1.5" />
          </div>
          <div>
            <Label>姓名</Label>
            <Input v-model="form.displayName" placeholder="例如 张三" class="mt-1.5" />
          </div>
          <div>
            <Label>部门</Label>
            <Input v-model="form.department" placeholder="例如 研发部" class="mt-1.5" />
          </div>
          <div>
            <Label>角色</Label>
            <Select v-model="form.role" :options="ROLE_OPTIONS" class="mt-1.5" />
          </div>
          <div>
            <Label>初始密码</Label>
            <Input v-model="form.password" type="password" placeholder="初始登录密码" class="mt-1.5" />
          </div>
        </template>

        <template v-else>
          <div>
            <Label>姓名</Label>
            <Input v-model="form.displayName" class="mt-1.5" />
          </div>
          <div>
            <Label>部门</Label>
            <Input v-model="form.department" class="mt-1.5" />
          </div>
          <div>
            <Label>角色</Label>
            <Select v-model="form.role" :options="ROLE_OPTIONS" :disabled="isSelf(formUser)" class="mt-1.5" />
          </div>
        </template>
      </form>
      <template #footer>
        <Button variant="outline" @click="formOpen = false">取消</Button>
        <Button :disabled="pending" @click="onFormSubmit">
          {{ pending ? '提交中…' : '保存' }}
        </Button>
      </template>
    </Dialog>

    <!-- 第一步：重置密码前，安全验证当前管理员密码（需求：验证成功才允许重置） -->
    <Dialog
      :open="verifyOpen"
      :title="`安全验证：重置 ${resetTarget?.username ?? ''} 的密码`"
      description="此操作将重置该用户的登录密码并使 TA 的所有会话失效。请先输入当前管理员的登录密码完成身份验证。"
      @update:open="(v) => (v ? null : (verifyOpen = false))"
    >
      <form class="flex flex-col gap-4" @submit.prevent="onVerifySubmit">
        <div>
          <Label>当前管理员密码</Label>
          <Input
            v-model="verifyPassword"
            type="password"
            placeholder="输入当前管理员登录密码"
            class="mt-1.5"
            autocomplete="current-password"
          />
          <p v-if="verifyError" class="mt-1.5 text-xs text-ember">{{ verifyError }}</p>
        </div>
      </form>
      <template #footer>
        <Button variant="outline" @click="verifyOpen = false">取消</Button>
        <Button :disabled="verifyBusy || !verifyPassword" @click="onVerifySubmit">
          {{ verifyBusy ? '验证中…' : '验证并继续' }}
        </Button>
      </template>
    </Dialog>

    <!-- 第二步：验证通过后设置新密码 -->
    <Dialog
      :open="resetOpen"
      :title="`重置 ${resetTarget?.username ?? ''} 的密码`"
      description="安全验证已通过。请为对方设置新登录密码（8–72 个字符），保存后其旧会话将全部失效。"
      @update:open="(v) => (v ? null : (resetOpen = false))"
    >
      <form class="flex flex-col gap-4" @submit.prevent="onResetSubmit">
        <div>
          <Label>新密码</Label>
          <Input
            v-model="newPassword"
            type="password"
            placeholder="输入新登录密码（8–72 个字符）"
            class="mt-1.5"
            autocomplete="new-password"
          />
          <p v-if="resetResult" class="mt-1.5 text-xs text-status-available">✓ 密码已重置</p>
        </div>
      </form>
      <template #footer>
        <Button variant="outline" @click="resetOpen = false">取消</Button>
        <Button :disabled="resetBusy || !newPassword" @click="onResetSubmit">
          {{ resetBusy ? '重置中…' : '确认重置' }}
        </Button>
      </template>
    </Dialog>

    <!-- CSV 导入预览 / 二次确认 -->
    <Dialog
      :open="importOpen"
      title="确认导入用户"
      :description="importHeaderErrors.length
        ? `${importHeaderErrors.join('；')}。请补全列后重新选择文件。`
        : importResult
          ? '导入已完成，下方为逐行结果。'
          : `已解析 ${importRows.length} 行，其中 ${importValidRows.length} 行可导入。请确认下方列表后再执行导入。`"
      @update:open="onImportDialogToggle"
    >
      <div class="max-h-[50dvh] overflow-y-auto">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 bg-paper">
            <tr class="text-xs text-mid-gray">
              <th class="py-1.5 pr-2 font-medium">#</th>
              <th class="py-1.5 pr-2 font-medium">用户名</th>
              <th class="py-1.5 pr-2 font-medium">姓名</th>
              <th class="py-1.5 pr-2 font-medium">部门</th>
              <th class="py-1.5 pr-2 font-medium">角色</th>
              <th class="py-1.5 font-medium">检查</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in importRows" :key="row.index" class="border-t border-hairline">
              <td class="py-1.5 pr-2 tabular-nums text-mid-gray">{{ row.index }}</td>
              <td class="py-1.5 pr-2 font-medium">{{ row.username || '—' }}</td>
              <td class="py-1.5 pr-2">{{ row.displayName || '—' }}</td>
              <td class="py-1.5 pr-2 text-mid-gray">{{ row.department || '—' }}</td>
              <td class="py-1.5 pr-2">{{ row.role }}</td>
              <td class="py-1.5">
                <span v-if="row.imported" class="text-xs text-status-available">✓ 已导入</span>
                <span v-else-if="row.errors.length === 0" class="text-xs text-status-available">✓ 可导入</span>
                <span v-else class="text-xs text-ember">{{ row.errors.join('；') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <template #footer>
        <Button variant="outline" @click="onImportDialogToggle(false)">
          {{ importResult ? '关闭' : '取消' }}
        </Button>
        <Button
          v-if="!importResult"
          :disabled="importing || importValidRows.length === 0"
          @click="onImportConfirm"
        >
          {{ importing ? '导入中…' : `确认导入 ${importValidRows.length} 个用户` }}
        </Button>
      </template>
    </Dialog>

    <!-- 禁用/启用确认 -->
    <Dialog
      :open="confirm !== null"
      :title="confirm?.type === 'disable' ? `禁用用户 ${confirm?.user?.username}` : `启用用户 ${confirm?.user?.username}`"
      :description="confirm?.type === 'disable' ? '禁用后该用户无法登录；若有活动租约，请先强制回收对应账号。' : undefined"
      :destructive="confirm?.type === 'disable'"
      @update:open="confirm = null"
    >
      <template #footer>
        <Button variant="outline" @click="confirm = null">取消</Button>
        <Button
          :variant="confirm?.type === 'disable' ? 'destructive' : 'default'"
          :disabled="pending"
          @click="onToggleConfirm"
        >
          {{ pending ? '处理中…' : confirm?.type === 'disable' ? '确认禁用' : '确认启用' }}
        </Button>
      </template>
    </Dialog>
  </AdminLayout>
</template>
