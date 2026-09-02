<script setup>
import { computed, onMounted, ref } from 'vue'
import AdminLayout from '@/layouts/AdminLayout.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Table from '@/components/ui/Table.vue'
import TableBody from '@/components/ui/TableBody.vue'
import TableCell from '@/components/ui/TableCell.vue'
import TableHead from '@/components/ui/TableHead.vue'
import TableHeader from '@/components/ui/TableHeader.vue'
import TableRow from '@/components/ui/TableRow.vue'
import { getAdminLeases } from '@/api/admin'

const FILTER_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'ACTIVE', label: '使用中' },
  { value: 'RELEASED', label: '已释放' },
]

const RELEASE_REASON_META = {
  USER_RETURN: { label: '用户归还', variant: 'outline', tone: null },
  INACTIVITY_TIMEOUT: { label: '超时', variant: null, tone: 'recycling' },
  ADMIN_FORCE: { label: '强制回收', variant: null, tone: 'in_use' },
  RESET_ERROR: { label: '重置失败', variant: null, tone: 'error' },
}

const loading = ref(true)
const error = ref('')
const leases = ref([])
const filter = ref('all')

const filtered = computed(() => {
  if (filter.value === 'all') return leases.value
  return leases.value.filter((l) => l.status === filter.value)
})

async function load() {
  try {
    leases.value = await getAdminLeases()
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

function reasonMeta(reason) {
  return RELEASE_REASON_META[reason] || { label: reason || '—', variant: 'outline', tone: null }
}
</script>

<template>
  <AdminLayout>
    <div class="flex flex-col gap-6">
      <!-- 窄屏标题与筛选器纵向堆叠，筛选器占满一行更易点选 -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl font-semibold leading-7 tracking-normal text-ink sm:text-2xl sm:leading-8">
          租约记录
        </h1>
        <div class="w-full max-w-[10rem] sm:w-40">
          <Select v-model="filter" :options="FILTER_OPTIONS" />
        </div>
      </div>

      <!-- 六个时间/文本列，舒适最小宽度 800px -->
      <Card class="overflow-hidden">
        <Table min-width="min-w-[800px]">
          <TableHeader>
            <TableRow>
              <TableHead>领取人</TableHead>
              <TableHead>账号</TableHead>
              <TableHead>领取时间</TableHead>
              <TableHead>最后操作</TableHead>
              <TableHead>释放时间</TableHead>
              <TableHead>释放原因</TableHead>
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
              <TableRow v-for="lease in filtered" :key="lease.id">
                <!--
                  进行中的租约用首列左侧 2px ink 竖条标记。
                  标记放在单元格而非 <tr> 上：border-collapse 下 tr 边框渲染不可靠；
                  非活动行给同宽透明边，保证列位置不位移。
                -->
                <TableCell
                  :class="
                    lease.status === 'ACTIVE'
                      ? 'border-l-2 border-l-ink'
                      : 'border-l-2 border-l-transparent'
                  "
                >
                  {{ lease.userDisplayName || '—' }}
                </TableCell>
                <TableCell class="font-medium tabular-nums">{{ lease.accountCode }}</TableCell>
                <TableCell class="tabular-nums text-mid-gray">{{ formatDate(lease.startedAt) }}</TableCell>
                <TableCell class="tabular-nums text-mid-gray">{{ formatDate(lease.lastActivityAt) }}</TableCell>
                <TableCell class="tabular-nums text-mid-gray">{{ lease.releasedAt ? formatDate(lease.releasedAt) : '—' }}</TableCell>
                <TableCell>
                  <template v-if="lease.releaseReason">
                    <Badge
                      :variant="reasonMeta(lease.releaseReason).variant || undefined"
                      :tone="reasonMeta(lease.releaseReason).tone || null"
                    >
                      {{ reasonMeta(lease.releaseReason).label }}
                    </Badge>
                  </template>
                  <span v-else class="text-mid-gray">—</span>
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </Card>

      <p class="text-xs text-mid-gray">共 {{ filtered.length }} 条</p>
    </div>
  </AdminLayout>
</template>
