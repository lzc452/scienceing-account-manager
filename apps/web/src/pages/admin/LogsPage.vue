<script setup>
import { computed, onMounted, ref } from 'vue'
import AdminLayout from '@/layouts/AdminLayout.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Switch from '@/components/ui/Switch.vue'
import Table from '@/components/ui/Table.vue'
import TableBody from '@/components/ui/TableBody.vue'
import TableCell from '@/components/ui/TableCell.vue'
import TableHead from '@/components/ui/TableHead.vue'
import TableHeader from '@/components/ui/TableHeader.vue'
import TableRow from '@/components/ui/TableRow.vue'
import { getAdminLogs } from '@/api/admin'

const PAGE_SIZE = 20

const ACTION_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'LOGIN', label: 'LOGIN' },
  { value: 'CLAIM_ACCOUNT', label: 'CLAIM_ACCOUNT' },
  { value: 'ACTIVITY', label: 'ACTIVITY' },
  { value: 'RELEASE', label: 'RELEASE' },
  { value: 'TIMEOUT', label: 'TIMEOUT' },
  { value: 'RESET_PASSWORD', label: 'RESET_PASSWORD' },
  { value: 'RESET_SUCCESS', label: 'RESET_SUCCESS' },
  { value: 'RESET_FAILED', label: 'RESET_FAILED' },
  { value: 'ADMIN_FORCE_RELEASE', label: 'ADMIN_FORCE_RELEASE' },
  { value: 'ADMIN_MANUAL_FIX', label: 'ADMIN_MANUAL_FIX' },
  { value: 'SETTING_UPDATE', label: 'SETTING_UPDATE' },
]

const USER_NAMES = { 1: 'admin', 2: '张三', 3: '李四', 4: '王五' }

const loading = ref(true)
const error = ref('')
const allLogs = ref([])
const actionFilter = ref('all')
const showActivity = ref(false)
const page = ref(1)

const filteredLogs = computed(() => {
  let rows = allLogs.value
  if (!showActivity.value) rows = rows.filter((l) => l.action !== 'ACTIVITY')
  if (actionFilter.value !== 'all') rows = rows.filter((l) => l.action === actionFilter.value)
  return rows
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredLogs.value.length / PAGE_SIZE)))
const pagedLogs = computed(() => filteredLogs.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

async function load() {
  try {
    const res = await getAdminLogs({ page: 1, pageSize: 200 })
    allLogs.value = res.items || []
    error.value = ''
  } catch (e) {
    error.value = e?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function formatDate(iso) {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}:${ss}`
}

function userName(id) {
  if (id == null) return '系统'
  return USER_NAMES[id] || `#${id}`
}

function resultMeta(result) {
  if (result === 'SUCCESS') return { label: '成功', variant: 'soft', tone: null }
  if (result === 'FAILED') return { label: '失败', variant: 'ember-outline', tone: null }
  return { label: '进行中', variant: 'outline', tone: null }
}
</script>

<template>
  <AdminLayout>
    <div class="flex flex-col gap-6">
      <!--
        工具行：窄屏整块换行到第二行（标题独占一行、控件占满宽度），
        宽屏回到「标题左 / 控件右」。控件用 w-full sm:w-48 避免在 320px 下挤压。
      -->
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 class="text-xl font-semibold leading-7 tracking-normal text-ink sm:text-2xl sm:leading-8">
          系统日志
        </h1>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div class="flex items-center gap-2">
            <span class="whitespace-nowrap text-xs text-mid-gray">显示 Activity 明细</span>
            <Switch v-model="showActivity" />
          </div>
          <div class="w-full max-w-[12rem] sm:w-48">
            <Select v-model="actionFilter" :options="ACTION_OPTIONS" />
          </div>
        </div>
      </div>

      <Card class="overflow-hidden">
        <Table min-width="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>动作</TableHead>
              <TableHead>结果</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="loading">
              <TableRow v-for="i in 5" :key="i">
                <TableCell colspan="5"><Skeleton class="h-6 w-full" /></TableCell>
              </TableRow>
            </template>
            <template v-else-if="error">
              <TableRow>
                <TableCell colspan="5" class="py-6 text-center text-mid-gray">
                  {{ error }}
                  <Button variant="outline" size="sm" class="ml-3" @click="load">重试</Button>
                </TableCell>
              </TableRow>
            </template>
            <template v-else-if="pagedLogs.length === 0">
              <TableRow>
                <TableCell colspan="5" class="py-6 text-center text-mid-gray">暂无日志</TableCell>
              </TableRow>
            </template>
            <template v-else>
              <TableRow v-for="log in pagedLogs" :key="log.id">
                <TableCell class="tabular-nums text-mid-gray">{{ formatDate(log.createdAt) }}</TableCell>
                <TableCell class="font-medium">{{ log.action }}</TableCell>
                <TableCell>
                  <Badge :variant="resultMeta(log.result).variant">
                    {{ resultMeta(log.result).label }}
                  </Badge>
                </TableCell>
                <TableCell>{{ userName(log.userId) }}</TableCell>
                <TableCell class="tabular-nums text-mid-gray">{{ log.ip || '—' }}</TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </Card>

      <!-- 分页条：窄屏换行居中，避免「共 N 条」与翻页按钮挤成一行 -->
      <div class="flex flex-wrap items-center justify-between gap-3 text-xs text-mid-gray">
        <span>共 {{ filteredLogs.length }} 条</span>
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" :disabled="page <= 1" @click="page--">上一页</Button>
          <span class="tabular-nums">{{ page }} / {{ totalPages }}</span>
          <Button variant="outline" size="sm" :disabled="page >= totalPages" @click="page++">下一页</Button>
        </div>
      </div>
    </div>
  </AdminLayout>
</template>
