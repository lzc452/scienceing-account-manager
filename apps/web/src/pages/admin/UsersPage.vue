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
import { bulkCreateUsers, createUser, getAdminUsers, updateUser } from '@/api/admin'
import { authState } from '@/api'
import { parseUsersCsv, usersCsvTemplate } from '@/lib/csv'

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

// ── CSV 批量导入（上传 → 解析预览二次确认 → 批量创建） ──
const csvInputRef = ref(null)
const importOpen = ref(false) // 预览/确认弹窗
const importRows = ref([]) // 解析后的行
const importHeaderErrors = ref([])
const importing = ref(false)
const importResult = ref(null) // { created, failed: [] }

function pickCsv() {
  csvInputRef.value?.click()
}

function downloadTemplate() {
  const blob = new Blob(['\uFEFF' + usersCsvTemplate()], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '用户导入模板.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function onCsvFile(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // 允许重复选择同一文件
  if (!file) return
  if (!/\.csv$/i.test(file.name)) {
    toast({ title: '请选择 CSV 文件', variant: 'destructive' })
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    const { rows, headerErrors } = parseUsersCsv(String(reader.result ?? ''))
    importHeaderErrors.value = headerErrors
    importRows.value = rows
    importResult.value = null
    if (rows.length === 0) {
      toast({ title: '未解析到有效数据行', description: headerErrors.join('；') || undefined, variant: 'destructive' })
      return
    }
    importOpen.value = true
  }
  reader.onerror = () => toast({ title: '文件读取失败', variant: 'destructive' })
  reader.readAsText(file, 'utf-8')
}

const importValidRows = computed(() => importRows.value.filter((r) => r.errors.length === 0))

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
    importResult.value = res
    toast({
      title: `导入完成：成功 ${res.created} 个${res.failed.length ? `，失败 ${res.failed.length} 个` : ''}`,
      variant: res.failed.length ? 'default' : 'success',
    })
    load()
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

function openReset(user) {
  formMode.value = 'reset'
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
    } else if (formMode.value === 'edit') {
      await updateUser(formUser.value.id, {
        displayName: form.value.displayName,
        department: form.value.department,
        role: form.value.role,
      })
      toast({ title: '已保存', variant: 'success' })
    } else if (formMode.value === 'reset') {
      if (!form.value.password) {
        toast({ title: '请输入新密码', variant: 'destructive' })
        return
      }
      await updateUser(formUser.value.id, { password: form.value.password })
      toast({ title: '已重置，请转告用户', variant: 'success' })
    }
    formOpen.value = false
    load()
  } catch (e) {
    toast({ title: e?.message || '操作失败', variant: 'destructive' })
  } finally {
    pending.value = false
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
          <Button variant="outline" @click="pickCsv">导入CSV</Button>
          <Button @click="openCreate">创建用户</Button>
        </div>
      </div>
      <!-- 隐藏的文件选择器：导入CSV按钮触发 -->
      <input
        ref="csvInputRef"
        type="file"
        accept=".csv,text/csv"
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

    <!-- 创建 / 编辑 / 重置密码 -->
    <Dialog
      :open="formOpen"
      :title="formMode === 'create' ? '创建用户' : formMode === 'edit' ? '编辑用户' : '重置登录密码'"
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

        <template v-else-if="formMode === 'edit'">
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

        <template v-else>
          <div>
            <Label>新密码</Label>
            <Input v-model="form.password" type="password" placeholder="输入新登录密码" class="mt-1.5" />
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

    <!-- CSV 导入预览 / 二次确认 -->
    <Dialog
      :open="importOpen"
      title="确认导入用户"
      :description="importHeaderErrors.length
        ? importHeaderErrors.join('；')
        : `已解析 ${importRows.length} 行，其中 ${importValidRows.length} 行可导入。请确认下方列表后再执行导入。`"
      @update:open="importOpen = false"
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
                <span v-if="row.errors.length === 0" class="text-xs text-status-available">✓ 可导入</span>
                <span v-else class="text-xs text-ember">{{ row.errors.join('；') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="importResult" class="mt-3 text-sm">
        <span class="text-status-available">成功 {{ importResult.created }} 个</span>
        <span v-if="importResult.failed.length" class="ml-3 text-ember">
          失败 {{ importResult.failed.length }} 个（{{ importResult.failed.map((f) => `${f.username}：${f.reason}`).join('；') }}）
        </span>
      </p>
      <template #footer>
        <Button variant="outline" @click="importOpen = false">关闭</Button>
        <Button :disabled="importing || importValidRows.length === 0" @click="onImportConfirm">
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
