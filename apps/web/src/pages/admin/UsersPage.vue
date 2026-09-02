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
import { createUser, getAdminUsers, updateUser } from '@/api/admin'
import { authState } from '@/api'

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
        <Button @click="openCreate">创建用户</Button>
      </div>

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
