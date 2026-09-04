<script setup>
import { computed, onMounted, ref } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import AdminLayout from '@/layouts/AdminLayout.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import StatBlock from '@/components/StatBlock.vue'
import EChart from '@/components/admin/EChart.vue'
import { toast } from '@/components/ui/toast'
import { getDashboardStats } from '@/api/admin'
import { toStatusKind } from '@/lib/status'

/**
 * 数据看板（t13）：GET /api/admin/dashboard?days=7|30|90
 * 可视化统一走 ECharts（components/admin/EChart.vue 按需注册）；
 * 配色遵循平台边界：无彩色为主轴，语义色仅出现在状态/成败这类「状态」表达上。
 */

const RANGE_OPTIONS = [
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
  { value: 90, label: '近 90 天' },
]

const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const days = ref(30)
const stats = ref(null)

const FONT_FAMILY =
  "'Geist Sans', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', ui-sans-serif, system-ui, sans-serif"

const AXIS_LABEL = { color: '#737373', fontSize: 12, fontFamily: FONT_FAMILY }
const AXIS_LINE = { lineStyle: { color: '#e5e5e5' } }
const SPLIT_LINE = { lineStyle: { color: '#f0f0f0' } }

const STATUS_COLOR = { AVAILABLE: '#16a34a', IN_USE: '#2563eb', RECYCLING: '#d97706', ERROR: '#e7000b' }
const NEUTRAL_RAMP = ['#0a0a0a', '#525252', '#a3a3a3', '#d4d4d4']

onMounted(load)

async function load() {
  if (!stats.value) loading.value = true
  refreshing.value = true
  error.value = ''
  try {
    stats.value = await getDashboardStats(days.value)
  } catch (err) {
    error.value = err?.message || '看板加载失败，请重试'
    toast({ title: err?.message || '看板加载失败', variant: 'destructive' })
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function switchRange(value) {
  if (days.value === value) return
  days.value = value
  load()
}

const overviewCells = computed(() => {
  const o = stats.value?.overview
  if (!o) return []
  return [
    { label: '账号总数', value: o.accountTotal, hint: `含停用 ${o.accountDisabled}` },
    { label: '可用', value: o.available, dot: '#16a34a' },
    { label: '使用中', value: o.inUse, dot: '#2563eb' },
    { label: '回收中', value: o.recycling, dot: '#d97706' },
    { label: '异常', value: o.error, dot: '#e7000b' },
    { label: '当前租约', value: o.activeLeases, hint: `${o.activeUsers} 人占用中` },
    { label: `区间领用（${stats.value?.range?.days ?? days.value} 天）`, value: o.totalClaims, hint: '次' },
    { label: '平均单次时长', value: o.avgLeaseMinutes, hint: '分钟' },
  ]
})

// —— 图表 option ——
const accountStatusOption = computed(() => {
  const rows = stats.value?.accountStatus ?? []
  return donutOption({
    rows,
    colorMap: STATUS_COLOR,
    legendName: (row) => row.label,
  })
})

const claimTrendOption = computed(() => {
  const trend = stats.value?.claimTrend ?? []
  return {
    tooltip: { trigger: 'axis', ...tooltipCommon() },
    grid: { left: 8, right: 16, top: 24, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trend.map((d) => shortDay(d.day)),
      axisLabel: AXIS_LABEL,
      axisLine: AXIS_LINE,
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      axisLabel: AXIS_LABEL,
      splitLine: SPLIT_LINE,
    },
    series: [
      {
        name: '领用次数',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        data: trend.map((d) => d.count),
        lineStyle: { width: 2.5, color: '#0a0a0a' },
        itemStyle: { color: '#0a0a0a' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(10,10,10,0.10)' },
              { offset: 1, color: 'rgba(10,10,10,0.01)' },
            ],
          },
        },
      },
    ],
  }
})

const accountLoadOption = computed(() => horizontalBarOption({
  title: '按领用次数',
  rows: stats.value?.accountLoad ?? [],
  name: '领用次数',
  value: (row) => row.claimCount,
  category: (row) => row.code,
  color: '#0a0a0a',
  unit: '次',
  extra: (row) => `累计 ${row.totalMinutes.toLocaleString()} 分钟 · ${row.username}`,
}))

const topUsersOption = computed(() => horizontalBarOption({
  title: '按领用次数',
  rows: stats.value?.topUsers ?? [],
  name: '领用次数',
  value: (row) => row.claimCount,
  category: (row) => `${row.displayName}${row.department ? `（${row.department}）` : ''}`,
  color: '#525252',
  unit: '次',
  extra: (row) => `累计 ${row.totalMinutes.toLocaleString()} 分钟`,
}))

const passwordHealthOption = computed(() => {
  const buckets = stats.value?.passwordHealth?.buckets ?? []
  const colors = ['#171717', '#525252', '#a3a3a3', '#d97706', '#e7000b']
  return {
    tooltip: { trigger: 'axis', ...tooltipCommon() },
    grid: { left: 8, right: 16, top: 24, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: buckets.map((b) => b.label), axisLabel: AXIS_LABEL, axisLine: AXIS_LINE, axisTick: { show: false } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: AXIS_LABEL, splitLine: SPLIT_LINE },
    series: [
      {
        name: '账号数',
        type: 'bar',
        barMaxWidth: 40,
        data: buckets.map((b, i) => ({ value: b.count, itemStyle: { color: colors[i] } })),
        label: { show: true, position: 'top', color: '#737373', fontSize: 12 },
      },
    ],
  }
})

const releaseReasonOption = computed(() => donutOption({
  rows: stats.value?.releaseReasons ?? [],
  colorMap: Object.fromEntries(NEUTRAL_RAMP.map((c, i) => [i, c])),
  legendName: (row) => row.label,
}))

const resetJobOption = computed(() => {
  const r = stats.value?.resetJobs
  const data = [
    { name: '成功', value: r?.success ?? 0, itemStyle: { color: '#16a34a' } },
    { name: '失败', value: r?.failed ?? 0, itemStyle: { color: '#e7000b' } },
    { name: '待处理', value: r?.pending ?? 0, itemStyle: { color: '#a3a3a3' } },
    { name: '进行中', value: r?.running ?? 0, itemStyle: { color: '#d97706' } },
  ].filter((d) => d.value > 0)
  const total = data.reduce((s, d) => s + d.value, 0)
  const rate = total ? Math.round(((r?.success ?? 0) / (r?.total || 1)) * 100) : 0
  return {
    tooltip: { trigger: 'item', ...tooltipCommon() },
    legend: { bottom: 0, icon: 'circle', itemWidth: 8, textStyle: { color: '#171717', fontSize: 12 } },
    title: {
      text: `${rate}%`,
      subtext: '成功率',
      left: 'center',
      top: '34%',
      textStyle: { color: '#0a0a0a', fontSize: 24, fontWeight: 600, fontFamily: FONT_FAMILY },
      subtextStyle: { color: '#737373', fontSize: 12 },
    },
    series: [
      {
        type: 'pie',
        radius: ['60%', '78%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data,
      },
    ],
  }
})

function donutOption({ rows, colorMap, legendName }) {
  const data = rows.map((row) => ({
    name: legendName(row) ?? row.name,
    value: row.value,
    itemStyle: { color: colorMap[row.name] ?? '#a3a3a3' },
  }))
  return {
    tooltip: { trigger: 'item', ...tooltipCommon() },
    legend: { bottom: 0, icon: 'circle', itemWidth: 8, textStyle: { color: '#171717', fontSize: 12 } },
    series: [
      {
        type: 'pie',
        radius: ['52%', '74%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: { scaleSize: 4 },
        data,
      },
    ],
  }
}

function horizontalBarOption({ title, rows, name, value, category, color, unit, extra }) {
  const data = rows.slice(0, 10).reverse() // 翻转：榜首显示在最上方
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const p = params?.[0]
        if (!p) return ''
        const row = data[p.dataIndex]
        return `${row && extra(row) ? `${extra(row)}<br/>` : ''}${title}：<b>${p.value}${unit}</b>`
      },
    },
    grid: { left: 8, right: 44, top: 8, bottom: 4, containLabel: true },
    xAxis: { type: 'value', minInterval: 1, axisLabel: AXIS_LABEL, splitLine: SPLIT_LINE },
    yAxis: {
      type: 'category',
      data: data.map(category),
      axisLabel: { ...AXIS_LABEL, overflow: 'truncate', width: 120 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        name,
        type: 'bar',
        barMaxWidth: 14,
        data: data.map((row) => ({ value: value(row), itemStyle: { color, borderRadius: [0, 3, 3, 0] } })),
        label: {
          show: true,
          position: 'right',
          color: '#737373',
          fontSize: 12,
          formatter: ({ value: v }) => `${v}${unit}`,
        },
      },
    ],
  }
}

function tooltipCommon() {
  return {
    backgroundColor: '#ffffff',
    borderColor: '#e5e5e5',
    textStyle: { color: '#0a0a0a', fontSize: 12, fontFamily: FONT_FAMILY },
    confine: true,
  }
}

function shortDay(isoDay) {
  const [, m, d] = String(isoDay || '').split('-')
  return m && d ? `${m}-${d}` : isoDay
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function ageText(daysValue) {
  if (daysValue === null || daysValue === undefined) return '从未改密'
  return `${daysValue} 天`
}

const abnormalAccounts = computed(() => stats.value?.passwordHealth?.abnormal ?? [])
const hasNoData = computed(() => !loading.value && !error.value && (stats.value?.overview?.accountTotal ?? 0) === 0)
</script>

<template>
  <AdminLayout>
    <div class="flex flex-col gap-6">
      <!-- 页头 + 时间范围切换 + 手动刷新 -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold leading-7 tracking-normal text-ink sm:text-2xl sm:leading-8">数据看板</h1>
          <p v-if="!loading && stats" class="mt-1 text-sm text-mid-gray">
            统计范围：{{ stats.range.from.slice(0, 10) }} ~ {{ stats.range.to.slice(0, 10) }}（按 UTC 日）
          </p>
        </div>
        <div class="flex items-center gap-2">
          <div class="inline-flex rounded-2xl bg-canvas p-0.5">
            <button
              v-for="option in RANGE_OPTIONS"
              :key="option.value"
              type="button"
              :class="days === option.value ? 'bg-paper text-ink shadow-subtle' : 'text-mid-gray hover:text-ink'"
              class="rounded-xl px-3 py-1.5 text-sm transition-colors"
              @click="switchRange(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
          <Button variant="outline" :disabled="refreshing" @click="load">
            <RefreshCw :class="refreshing && 'animate-spin'" class="size-4" />
            刷新
          </Button>
        </div>
      </div>

      <!-- KPI 概览 -->
      <Card class="overflow-hidden">
        <div v-if="loading" class="grid grid-cols-2 gap-px bg-hairline md:grid-cols-4">
          <div v-for="i in 8" :key="i" class="bg-paper p-4 sm:p-5">
            <Skeleton class="h-3 w-14" />
            <Skeleton class="mt-2 h-8 w-16" />
          </div>
        </div>
        <div v-else-if="error" class="p-5">
          <p class="text-sm text-ink">{{ error }}</p>
          <Button variant="outline" size="sm" class="mt-3" @click="load">重试</Button>
        </div>
        <div v-else class="grid grid-cols-2 gap-px bg-hairline md:grid-cols-4">
          <div v-for="cell in overviewCells" :key="cell.label" class="bg-paper p-4 sm:p-5">
            <StatBlock v-bind="cell" />
          </div>
        </div>
      </Card>

      <template v-if="!loading && !error && !hasNoData">
        <!-- 第一行：状态分布 + 领用趋势 -->
        <div class="grid gap-6 xl:grid-cols-3">
          <Card class="overflow-hidden xl:col-span-1">
            <div class="border-b border-hairline px-4 py-3 sm:px-5">
              <h2 class="text-sm font-semibold leading-6 text-ink">账号状态分布</h2>
              <p class="text-xs text-mid-gray">当前启用账号的实时状态占比</p>
            </div>
            <div class="p-2 sm:p-3">
              <EChart :option="accountStatusOption" height="260px" />
            </div>
          </Card>
          <Card class="overflow-hidden xl:col-span-2">
            <div class="border-b border-hairline px-4 py-3 sm:px-5">
              <h2 class="text-sm font-semibold leading-6 text-ink">领用趋势</h2>
              <p class="text-xs text-mid-gray">近 {{ stats.range.days }} 天每日领用次数</p>
            </div>
            <div class="p-2 sm:p-3">
              <EChart :option="claimTrendOption" height="260px" />
            </div>
          </Card>
        </div>

        <!-- 第二行：账号负载 / 用户活跃 -->
        <div class="grid gap-6 xl:grid-cols-2">
          <Card class="overflow-hidden">
            <div class="border-b border-hairline px-4 py-3 sm:px-5">
              <h2 class="text-sm font-semibold leading-6 text-ink">账号负载 TOP10</h2>
              <p class="text-xs text-mid-gray">近 {{ stats.range.days }} 天被领用最频繁的账号</p>
            </div>
            <div class="p-2 sm:p-3">
              <EChart :option="accountLoadOption" height="300px" />
            </div>
          </Card>
          <Card class="overflow-hidden">
            <div class="border-b border-hairline px-4 py-3 sm:px-5">
              <h2 class="text-sm font-semibold leading-6 text-ink">用户活跃 TOP10</h2>
              <p class="text-xs text-mid-gray">近 {{ stats.range.days }} 天领用次数最多的用户</p>
            </div>
            <div class="p-2 sm:p-3">
              <EChart :option="topUsersOption" height="300px" />
            </div>
          </Card>
        </div>

        <!-- 第三行：密码健康度 / 归还构成 / 改密成功率 -->
        <div class="grid gap-6 xl:grid-cols-3">
          <Card class="overflow-hidden">
            <div class="border-b border-hairline px-4 py-3 sm:px-5">
              <h2 class="text-sm font-semibold leading-6 text-ink">密码健康度</h2>
              <p class="text-xs text-mid-gray">按距离上次自动改密的天数分桶</p>
            </div>
            <div class="p-2 sm:p-3">
              <EChart :option="passwordHealthOption" height="240px" />
            </div>
          </Card>
          <Card class="overflow-hidden">
            <div class="border-b border-hairline px-4 py-3 sm:px-5">
              <h2 class="text-sm font-semibold leading-6 text-ink">归还方式构成</h2>
              <p class="text-xs text-mid-gray">近 {{ stats.range.days }} 天租约的结束方式</p>
            </div>
            <div class="p-2 sm:p-3">
              <EChart :option="releaseReasonOption" height="240px" />
            </div>
          </Card>
          <Card class="overflow-hidden">
            <div class="border-b border-hairline px-4 py-3 sm:px-5">
              <h2 class="text-sm font-semibold leading-6 text-ink">改密任务成功率</h2>
              <p class="text-xs text-mid-gray">近 {{ stats.range.days }} 天科应改密任务</p>
            </div>
            <div class="p-2 sm:p-3">
              <EChart :option="resetJobOption" height="240px" />
            </div>
          </Card>
        </div>

        <!-- 需关注账号清单 -->
        <Card class="overflow-hidden">
          <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline px-4 py-3 sm:px-5">
            <div>
              <h2 class="text-sm font-semibold leading-6 text-ink">需关注的账号</h2>
              <p class="text-xs text-mid-gray">异常 / 停用 / 密码超过 90 天未更换 / 从未改密</p>
            </div>
            <span class="text-xs text-mid-gray">共 {{ abnormalAccounts.length }} 条</span>
          </div>
          <div v-if="abnormalAccounts.length === 0" class="px-4 py-10 text-center text-sm text-mid-gray sm:px-5">
            当前没有需要关注的账号 🎉
          </div>
          <div v-else class="table-scroll">
            <table class="w-full min-w-[860px] text-sm">
              <thead>
                <tr class="border-b border-hairline text-left text-xs font-medium text-mid-gray">
                  <th class="px-4 py-2.5 font-medium sm:px-5">账号</th>
                  <th class="px-4 py-2.5 font-medium sm:px-5">科应账号</th>
                  <th class="px-4 py-2.5 font-medium sm:px-5">状态</th>
                  <th class="px-4 py-2.5 font-medium sm:px-5">最近改密</th>
                  <th class="px-4 py-2.5 font-medium sm:px-5">密码年龄</th>
                  <th class="px-4 py-2.5 font-medium sm:px-5">最近一次改密失败</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in abnormalAccounts"
                  :key="row.accountId"
                  class="border-b border-hairline last:border-0 hover:bg-surface-alt/60"
                >
                  <td class="px-4 py-2.5 font-medium text-ink sm:px-5">{{ row.code }}</td>
                  <td class="px-4 py-2.5 text-ink sm:px-5">{{ row.username }}</td>
                  <td class="px-4 py-2.5 sm:px-5">
                    <span class="inline-flex items-center gap-2">
                      <Badge :tone="toStatusKind(row.status)" />
                      <span v-if="!row.enabled" class="text-xs text-mid-gray">已停用</span>
                    </span>
                  </td>
                  <td class="px-4 py-2.5 text-ink sm:px-5">{{ fmtDate(row.lastPasswordChangedAt) }}</td>
                  <td class="px-4 py-2.5 text-ink sm:px-5">{{ ageText(row.passwordAgeDays) }}</td>
                  <td class="px-4 py-2.5 text-mid-gray sm:px-5">
                    <template v-if="row.lastErrorAt">
                      {{ row.lastError || '改密失败' }}
                      <span class="text-xs">（{{ fmtDate(row.lastErrorAt) }}）</span>
                    </template>
                    <span v-else>—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </template>

      <!-- 空库提示 -->
      <Card v-if="hasNoData" class="p-10 text-center">
        <p class="text-sm text-mid-gray">库中还没有科应账号，先到「账号管理」添加账号，看板即有数据。</p>
      </Card>
    </div>
  </AdminLayout>
</template>
