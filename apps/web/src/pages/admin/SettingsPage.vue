<script setup>
import { computed, onMounted, ref } from 'vue'
import AdminLayout from '@/layouts/AdminLayout.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { toast } from '@/components/ui/toast'
import { getExtensionConfig, getSettings, runHealthCheck, updateSettings } from '@/api/admin'
import { downloadExtensionZip, extensionPackage, loadExtensionPackage } from '@/api'

const loading = ref(true)
const savingKey = ref('')
const checking = ref(false)

/** 租约规则表单元数据：驱动 v-for 渲染，保证三条规则的响应式行为完全一致 */
const RULES = [
  { key: 'inactivity_timeout_seconds', label: '无操作超时（秒）' },
  { key: 'warning_seconds', label: '即将释放提醒（秒）' },
  { key: 'critical_warning_seconds', label: '临界提醒（秒）' },
]

const leaseRules = ref({
  inactivity_timeout_seconds: '1800',
  warning_seconds: '300',
  critical_warning_seconds: '60',
})

const extensionConfig = ref({ minimumVersion: '1.0.0', latestVersion: '1.2.0' })
const health = ref({ lastCheckedAt: null, items: [] })

const healthOk = computed(() => health.value.items.length > 0 && health.value.items.every((i) => i.ok))

async function load() {
  try {
    const [settings, ext] = await Promise.all([getSettings(), getExtensionConfig()])
    leaseRules.value = {
      inactivity_timeout_seconds: settings.inactivity_timeout_seconds ?? '1800',
      warning_seconds: settings.warning_seconds ?? '300',
      critical_warning_seconds: settings.critical_warning_seconds ?? '60',
    }
    extensionConfig.value = ext
  } catch (e) {
    toast({ title: e?.message || '加载失败', variant: 'destructive' })
  } finally {
    loading.value = false
  }
}

function formatSize(bytes) {
  if (!bytes) return '—'
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** 下载浏览器扩展 ZIP（部署时由 deploy-lan 打包到 /downloads/scienceing-extension.zip）。 */
function onDownloadExtension() {
  if (!extensionPackage.available) {
    toast({ title: '扩展包尚未生成', description: '请先在部署机执行 deploy-lan 的 deploy / extension:pack', variant: 'destructive' })
    return
  }
  downloadExtensionZip()
  toast({ title: '开始下载', description: `扩展 ZIP v${extensionPackage.version || '—'}，解压后通过「加载已解压的扩展程序」安装` })
}

onMounted(() => {
  load()
  onCheck()
  loadExtensionPackage()
})

async function applyRule(key) {
  savingKey.value = key
  try {
    await updateSettings({ [key]: leaseRules.value[key] })
    toast({ title: '已应用', variant: 'success' })
  } catch (e) {
    toast({ title: e?.message || '应用失败', variant: 'destructive' })
  } finally {
    savingKey.value = ''
  }
}

async function onCheck() {
  checking.value = true
  try {
    // 45s 兜底：防止后端/Worker 异常时请求挂起导致按钮永远“检测中…”
    const result = await Promise.race([
      runHealthCheck(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('检测超时（>45s），请重试')), 45_000)),
    ])
    health.value = result
  } catch (e) {
    toast({ title: e?.message || '检测失败', variant: 'destructive' })
  } finally {
    checking.value = false
  }
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}
</script>

<template>
  <!-- 表单类稀疏页：内容栏收窄到 768px 并居中，避免表单控件在超宽屏上散开 -->
  <AdminLayout content-width="narrow">
    <div class="flex flex-col gap-6">
      <h1 class="text-xl font-semibold leading-7 tracking-normal text-ink sm:text-2xl sm:leading-8">
        系统参数
      </h1>

      <!-- 租约规则 -->
      <Card>
        <div class="p-4 sm:p-5">
          <h2 class="text-base font-semibold leading-6 text-ink">租约规则</h2>
          <div v-if="loading" class="mt-4 flex flex-col gap-3">
            <Skeleton v-for="i in 3" :key="i" class="h-9 w-full" />
          </div>
          <!--
            每条规则：窄屏纵向堆叠（标签一行、输入+按钮一行），
            ≥640px 回到横向排布并用固定宽标签对齐成两列。
          -->
          <div v-else class="mt-4 flex flex-col gap-4">
            <div
              v-for="rule in RULES"
              :key="rule.key"
              class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
            >
              <Label class="sm:w-44 sm:shrink-0">{{ rule.label }}</Label>
              <div class="flex items-center gap-3">
                <Input
                  v-model="leaseRules[rule.key]"
                  type="number"
                  class="w-full max-w-[140px] text-right tabular-nums"
                />
                <Button
                  variant="outline"
                  size="sm"
                  class="shrink-0"
                  :disabled="savingKey === rule.key"
                  @click="applyRule(rule.key)"
                >
                  应用
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <!-- 扩展配置 -->
      <Card>
        <div class="p-4 sm:p-5">
          <h2 class="text-base font-semibold leading-6 text-ink">扩展配置</h2>
          <div class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-4">
            <div class="text-sm">
              <span class="text-mid-gray">最低版本</span>
              <span class="ml-2 font-medium tabular-nums text-ink">{{ extensionConfig.minimumVersion }}</span>
            </div>
            <div class="text-sm">
              <span class="text-mid-gray">最新版本</span>
              <span class="ml-2 font-medium tabular-nums text-ink">{{ extensionConfig.latestVersion }}</span>
            </div>
            <Button variant="outline" size="sm" :disabled="!extensionPackage.available" @click="onDownloadExtension">
              下载最新版 ZIP
            </Button>
          </div>
          <p class="mt-3 text-xs text-mid-gray">
            <template v-if="extensionPackage.available">
              分发包 v{{ extensionPackage.version || '—' }} · {{ formatSize(extensionPackage.size) }} · 更新于
              {{ extensionPackage.updatedAt ? formatDate(extensionPackage.updatedAt) : '—' }}；
              同事下载后解压，在 Chrome 扩展页开启「开发者模式」→「加载已解压的扩展程序」选中解压目录即可。
            </template>
            <template v-else>
              分发包尚未生成：请在部署机执行 deploy-lan 的 <code class="rounded bg-surface-alt px-1">deploy</code> 或
              <code class="rounded bg-surface-alt px-1">extension:pack</code>，产物会自动放到 /downloads/scienceing-extension.zip。
            </template>
          </p>
        </div>
      </Card>

      <!-- 自动化健康检查 -->
      <Card>
        <div class="p-4 sm:p-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-base font-semibold leading-6 text-ink">Scienceing 自动化</h2>
            <Button variant="outline" size="sm" :disabled="checking" @click="onCheck">
              {{ checking ? '检测中…' : '立即检测' }}
            </Button>
          </div>

          <div class="mt-4 flex flex-col gap-3">
            <div v-for="item in health.items" :key="item.key" class="flex items-center gap-2.5">
              <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: item.ok ? '#16a34a' : '#e7000b' }" aria-hidden="true" />
              <span class="min-w-0 flex-1 text-sm text-ink">{{ item.label }}</span>
              <Badge v-if="item.ok" tone="available" class="shrink-0">正常</Badge>
              <Badge v-else tone="error" class="shrink-0">异常</Badge>
            </div>
          </div>

          <!-- 失败原因（如缺少 Worker 环境变量 / 科应页面改版） -->
          <p v-if="!healthOk && health.error" class="mt-3 text-xs leading-relaxed text-ember">
            {{ health.error }}
          </p>

          <div class="mt-4 flex items-center justify-between border-t border-hairline pt-4">
            <Badge :tone="healthOk ? 'available' : 'error'">{{ healthOk ? '正常' : '异常' }}</Badge>
            <p class="text-xs tabular-nums text-mid-gray">最后检测：{{ formatDate(health.lastCheckedAt) }}</p>
          </div>
        </div>
      </Card>
    </div>
  </AdminLayout>
</template>
