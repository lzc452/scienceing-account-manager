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
  disableAccount,
  enableAccount,
  forceRelease,
  getAdminAccounts,
  markAvailable,
  renameAccount as renameAccountApi,
  resetPassword,
} from '@/api/admin'
import { toStatusKind } from '@/lib/status'

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
      <!-- 标题字号 20 → 24px 递进；min-w-0 防止长标题撑破容器 -->
      <h1 class="text-xl font-semibold leading-7 tracking-normal text-ink sm:text-2xl sm:leading-8">
        科应账号管理
      </h1>

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
                    <button
                      type="button"
                      class="rounded-2xl px-1.5 py-0.5 text-xs text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink"
                      @click="openRename(account)"
                    >
                      改名
                    </button>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge :tone="toStatusKind(account.status)" />
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
                      <Button
                        v-if="account.enabled"
                        variant="ghost"
                        size="sm"
                        class="text-ember hover:bg-status-error-soft hover:text-ember"
                        @click="openDialog('disable', account)"
                      >
                        禁用账号
                      </Button>
                      <Button
                        v-else
                        variant="ghost"
                        size="sm"
                        @click="openDialog('enable', account)"
                      >
                        启用账号
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
  </AdminLayout>
</template>
