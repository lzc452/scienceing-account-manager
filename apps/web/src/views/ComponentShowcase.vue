<script setup>
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import StatusDot from '@/components/StatusDot.vue'
import StatBlock from '@/components/StatBlock.vue'
import Countdown from '@/components/Countdown.vue'
import PasswordReveal from '@/components/PasswordReveal.vue'
import PluginChip from '@/components/PluginChip.vue'
import ProgressHairline from '@/components/ProgressHairline.vue'
import Section from '@/components/Section.vue'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import CardDescription from '@/components/ui/CardDescription.vue'
import CardFooter from '@/components/ui/CardFooter.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import CardTitle from '@/components/ui/CardTitle.vue'
import Dialog from '@/components/ui/Dialog.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Switch from '@/components/ui/Switch.vue'
import Table from '@/components/ui/Table.vue'
import TableBody from '@/components/ui/TableBody.vue'
import TableCell from '@/components/ui/TableCell.vue'
import TableHead from '@/components/ui/TableHead.vue'
import TableHeader from '@/components/ui/TableHeader.vue'
import TableRow from '@/components/ui/TableRow.vue'
import { toast } from '@/components/ui/toast'

const grayscale = ref(false)
const dialogOpen = ref(false)
const switchOn = ref(true)
const username = ref('')
const filter = ref('all')
const countdownSeconds = 27 * 60 + 46

const statusKinds = ['available', 'in_use', 'recycling', 'error', 'released']

const filterOptions = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '使用中' },
  { value: 'released', label: '已释放' },
]
</script>

<template>
  <div
    class="min-h-screen w-full bg-canvas"
    :style="grayscale ? 'filter: grayscale(1)' : undefined"
  >
    <!-- 复用 .page-container：与业务页共享同一套最大宽度与安全边距 -->
    <div class="page-container py-8 sm:py-10">
      <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h1
            class="text-[24px] font-semibold leading-tight tracking-[-0.75px] text-ink sm:text-[30px]"
          >
            组件总览
          </h1>
          <p class="mt-1 text-sm text-mid-gray">
            Phase 0 · 设计系统与基础组件（Tailwind v4 + shadcn 主题映射）
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-mid-gray">灰度滤镜</span>
          <Switch v-model="grayscale" />
        </div>
      </div>

      <!-- 状态语义色 -->
      <Section title="状态语义（§4.1 · 彩色仅限状态标签）">
        <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
          <StatusDot v-for="k in statusKinds" :key="k" :status="k" />
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <Badge v-for="k in statusKinds" :key="k" :tone="k" />
        </div>
      </Section>

      <!-- Stat Block + Countdown -->
      <Section title="Stat Block · Countdown">
        <div class="flex flex-wrap gap-x-12 gap-y-6">
          <StatBlock label="可用" :value="6" dot="#16a34a" />
          <StatBlock label="使用中" :value="3" dot="#2563eb" />
          <StatBlock label="回收中" :value="1" dot="#d97706" />
          <StatBlock label="异常" :value="0" dot="#e7000b" />
        </div>
        <div class="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
          <div>
            <Label>预计释放</Label>
            <Countdown :seconds="countdownSeconds" class="mt-1 block text-2xl font-semibold text-ink" />
          </div>
          <div class="w-48">
            <Label>无操作时长</Label>
            <Countdown :seconds="134" class="mt-1 block text-2xl font-semibold text-ink" />
          </div>
        </div>
      </Section>

      <!-- 徽章 -->
      <Section title="Badge · 黑白四变体">
        <div class="flex flex-wrap items-center gap-3">
          <Badge variant="solid">solid</Badge>
          <Badge variant="soft">soft</Badge>
          <Badge variant="outline">outline</Badge>
          <Badge variant="ember-outline">ember-outline</Badge>
        </div>
      </Section>

      <!-- 按钮 -->
      <Section title="Button">
        <div class="flex flex-wrap items-center gap-3">
          <Button>主按钮</Button>
          <Button variant="secondary">次要按钮</Button>
          <Button variant="outline">描边按钮</Button>
          <Button variant="ghost">幽灵按钮</Button>
          <Button variant="destructive">危险操作</Button>
          <Button variant="outline" size="sm">小按钮</Button>
        </div>
      </Section>

      <!-- 表单元素 -->
      <Section title="Input · Select · Switch">
        <div class="grid max-w-lg gap-5">
          <div>
            <Label for="demo-username">用户名</Label>
            <Input id="demo-username" v-model="username" placeholder="请输入用户名" class="mt-1.5" />
          </div>
          <div>
            <Label>状态筛选</Label>
            <Select v-model="filter" :options="filterOptions" class="mt-1.5 w-full max-w-xs" />
          </div>
          <div class="flex items-center gap-3">
            <Switch v-model="switchOn" />
            <span class="text-sm text-mid-gray">{{ switchOn ? '已开启' : '已关闭' }}</span>
          </div>
        </div>
      </Section>

      <!-- 密码展示 -->
      <Section title="PasswordReveal · 遮蔽 / 显示 / 复制（30s 自动遮蔽）">
        <PasswordReveal password="demo-placeholder" class="max-w-md" />
      </Section>

      <!-- 插件状态 + 进度条 -->
      <Section title="PluginChip · ProgressHairline">
        <div class="flex flex-col gap-4">
          <PluginChip state="ready" version="1.0.0" />
          <PluginChip state="outdated" version="1.0.0" min-version="1.1.0" />
          <PluginChip state="missing" />
        </div>
        <div class="mt-6 max-w-md">
          <Label>使用时长占比</Label>
          <ProgressHairline :value="62" class="mt-2" />
        </div>
      </Section>

      <!-- 骨架屏 -->
      <Section title="Skeleton">
        <div class="flex max-w-md flex-col gap-3">
          <Skeleton class="h-9 w-full" />
          <Skeleton class="h-9 w-3/4" />
          <Skeleton class="h-9 w-1/2" />
        </div>
      </Section>

      <!-- 数据表格 -->
      <Section title="Table">
        <Card class="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>账号</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>最后操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell class="font-medium">KY-01</TableCell>
                <TableCell><Badge tone="available" /></TableCell>
                <TableCell class="text-mid-gray">3 分钟前</TableCell>
              </TableRow>
              <TableRow>
                <TableCell class="font-medium">KY-02</TableCell>
                <TableCell><Badge tone="in_use" /></TableCell>
                <TableCell class="text-mid-gray">28:04 后释放</TableCell>
              </TableRow>
              <TableRow>
                <TableCell class="font-medium">KY-03</TableCell>
                <TableCell><Badge tone="recycling" /></TableCell>
                <TableCell class="text-mid-gray">—</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </Section>

      <!-- Dialog + Toast -->
      <Section title="Dialog · Toast">
        <div class="flex flex-wrap gap-3">
          <Button variant="outline" @click="dialogOpen = true">打开确认弹窗</Button>
          <Button variant="outline" @click="toast({ title: '已保存', description: '设置已生效', variant: 'success' })">
            成功 Toast
          </Button>
          <Button variant="outline" @click="toast({ title: '回收失败', description: '未找到「重置密码」按钮', variant: 'destructive' })">
            错误 Toast
          </Button>
        </div>
      </Section>

      <!-- App Shell 入口 -->
      <Section title="App Shell（侧边栏 #fafafa + 内容区 canvas）">
        <Card>
          <CardHeader>
            <CardTitle>管理后台布局</CardTitle>
            <CardDescription>侧边栏 240px / 面包屑顶栏 / 内容区，见管理页。</CardDescription>
          </CardHeader>
          <CardFooter>
            <RouterLink to="/admin/accounts">
              <Button variant="secondary">查看 App Shell →</Button>
            </RouterLink>
          </CardFooter>
        </Card>
      </Section>
    </div>

    <Dialog
      v-model:open="dialogOpen"
      title="立即归还 KY-03"
      description="归还后将重置密码并退出当前科应会话。"
      destructive
    >
      <template #footer="{ close }">
        <Button variant="outline" @click="close">取消</Button>
        <Button variant="destructive" @click="close">确认归还</Button>
      </template>
    </Dialog>
  </div>
</template>
