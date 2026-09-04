<script setup>
import { computed, onMounted, ref } from 'vue'
import { BookOpen, Heading2, Bold, List, ListOrdered, Code, Link, ImagePlus, ImageUp, Pencil, Save, X } from 'lucide-vue-next'
import PublicLayout from '@/layouts/PublicLayout.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Input from '@/components/ui/Input.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Textarea from '@/components/ui/Textarea.vue'
import { toast } from '@/components/ui/toast'
import { authState, getManual } from '@/api'
import { updateManual } from '@/api/admin'
import { placeholderImageSnippet, renderMarkdown } from '@/lib/markdown'
import { checkImageFile, describeImageFile, fileToInlineImage } from '@/lib/image-upload'

/**
 * 使用手册（t13）
 *
 * 读取：GET /api/manual（游客 / 用户 / 管理员均可读，无需登录）。
 * 角色差异：
 *   - 普通用户 / 游客：只读渲染 Markdown，绝不出现编辑控件；
 *   - 管理员：页面出现「编辑内容」入口，编辑态提供 标题输入 + Markdown 工具栏 +
 *     「编辑 / 预览」分栏与左右分栏实时预览，保存后全站同步更新。
 *
 * 图片说明（管理员编辑态）：
 *   - 「上传图片」：选本地截图 → 自动等比压缩（最长边 ≤1440px，JPEG/WebP ≈82% 质量）
 *     → 以 data URL 内联进正文（随手册存库，不依赖文件存储，构建/清理不丢图）；
 *   - 「图片占位」：正文写 `![说明](placeholder)`，渲染成「待补充图片」提示框，
 *     供先标注、后补图的工作流。上传真图后把对应占位行删掉即可。
 */

const canEdit = computed(() => authState.user?.role === 'ADMIN')

const loading = ref(true)
const error = ref('')
const manual = ref({ title: '', content: '', updatedAt: '', updatedByDisplayName: null, isDefault: false })

// —— 编辑态 ——
const editing = ref(false)
const saving = ref(false)
const draftTitle = ref('')
const draftContent = ref('')
/** 小屏下「编辑 / 预览」互斥；≥lg 双栏同显 */
const pane = ref('write')

const html = computed(() => renderMarkdown(manual.value.content))
const previewHtml = computed(() => renderMarkdown(draftContent.value))

const metaText = computed(() => {
  const parts = []
  if (manual.value.updatedAt) {
    parts.push(`最后更新：${new Date(manual.value.updatedAt).toLocaleString('zh-CN', { hour12: false })}`)
  }
  if (manual.value.updatedByDisplayName) parts.push(`维护人：${manual.value.updatedByDisplayName}`)
  if (manual.value.isDefault) parts.push('（内置默认版本，尚未修改）')
  return parts.join(' · ')
})

onMounted(load)

async function load() {
  loading.value = true
  error.value = ''
  try {
    manual.value = await getManual()
  } catch (err) {
    error.value = err?.message || '手册加载失败，请重试'
  } finally {
    loading.value = false
  }
}

function startEdit() {
  draftTitle.value = manual.value.title
  draftContent.value = manual.value.content
  pane.value = 'write'
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  draftTitle.value = ''
  draftContent.value = ''
}

async function save() {
  if (!draftTitle.value.trim()) {
    toast({ title: '请填写手册标题', variant: 'destructive' })
    return
  }
  if (!draftContent.value.trim()) {
    toast({ title: '正文不能为空', variant: 'destructive' })
    return
  }
  saving.value = true
  try {
    const saved = await updateManual({ title: draftTitle.value.trim(), content: draftContent.value })
    manual.value = saved
    editing.value = false
    toast({ title: '手册已保存，全站同步更新', variant: 'success' })
  } catch (err) {
    toast({ title: err?.message || '保存失败，请重试', variant: 'destructive' })
  } finally {
    saving.value = false
  }
}

// —— Markdown 快捷插入：在选区前后包裹语法，未选中则插入占位文本 ——
const editorEl = ref(null)

/** 编辑器实际 <textarea> DOM（Textarea.vue 通过 defineExpose 暴露 .el）。 */
function editorDom() {
  return editorEl.value?.el ?? editorEl.value
}

function focusEditor() {
  editorDom()?.focus?.()
}

function wrapSelection(before, after, placeholder) {
  const el = editorDom()
  if (!el) return
  const start = el.selectionStart ?? draftContent.value.length
  const end = el.selectionEnd ?? draftContent.value.length
  const selected = draftContent.value.slice(start, end) || placeholder
  const next = draftContent.value.slice(0, start) + before + selected + after + draftContent.value.slice(end)
  draftContent.value = next
  requestAnimationFrame(() => {
    el.focus()
    const cursor = start + before.length + selected.length + after.length
    el.setSelectionRange(cursor, cursor)
  })
}

function insertBlock(text) {
  const el = editorDom()
  if (!el) return
  const start = el.selectionStart ?? draftContent.value.length
  const prefix = draftContent.value.slice(0, start)
  const needBreak = prefix && !prefix.endsWith('\n\n')
  const next = prefix + (needBreak ? '\n\n' : '') + text + '\n\n' + draftContent.value.slice(start)
  draftContent.value = next
  requestAnimationFrame(() => {
    el.focus()
    const cursor = prefix.length + (needBreak ? 2 : 0) + text.length + 2
    el.setSelectionRange(cursor, cursor)
  })
}

const toolActions = [
  { label: '小标题（H2）', icon: Heading2, run: () => insertBlock('## 请输入小标题') },
  { label: '加粗', icon: Bold, run: () => wrapSelection('**', '**', '加粗文字') },
  { label: '无序列表', icon: List, run: () => insertBlock('- 列表项一\n- 列表项二') },
  { label: '有序列表', icon: ListOrdered, run: () => insertBlock('1. 第一步\n2. 第二步') },
  { label: '行内代码', icon: Code, run: () => wrapSelection('`', '`', 'code') },
  { label: '链接', icon: Link, run: () => wrapSelection('[', '](https://)', '链接文字') },
  { label: '图片占位（待补图）', icon: ImagePlus, run: () => insertBlock(placeholderImageSnippet('简要说明这张图要展示什么')) },
]

// —— 图片上传：本地文件 → 压缩 → data URL 内联进正文 ——
const uploading = ref(false)
const fileInput = ref(null)
const MAX_IMAGES_PER_BATCH = 6

function triggerUpload() {
  fileInput.value?.click()
}

function insertParagraph(text) {
  const el = editorDom()
  if (!el) return
  const start = el.selectionStart ?? draftContent.value.length
  const prefix = draftContent.value.slice(0, start)
  const needBreak = prefix && !prefix.endsWith('\n\n')
  const next = prefix + (needBreak ? '\n\n' : '') + text + '\n\n' + draftContent.value.slice(start)
  draftContent.value = next
  requestAnimationFrame(() => {
    el.focus()
    const cursor = prefix.length + (needBreak ? 2 : 0) + text.length + 2
    el.setSelectionRange(cursor, cursor)
  })
}

async function onPickImages(event) {
  const files = Array.from(event.target.files ?? [])
  event.target.value = '' // 允许连续选同一文件
  if (!files.length) return
  if (files.length > MAX_IMAGES_PER_BATCH) {
    toast({ title: `一次最多插入 ${MAX_IMAGES_PER_BATCH} 张图`, variant: 'destructive' })
    return
  }

  uploading.value = true
  let inserted = 0
  try {
    for (const file of files) {
      const typeError = checkImageFile(file)
      if (typeError) {
        toast({ title: `「${file.name}」：${typeError}`, variant: 'destructive' })
        continue
      }
      try {
        const { dataUrl, width, height } = await fileToInlineImage(file)
        const description = describeImageFile(file)
        insertParagraph(`![${description}](${dataUrl})`)
        inserted += 1
        toast({
          title: `已插入「${description}」`,
          description: `压缩后 ${width}×${height}，约 ${Math.max(1, Math.round(dataUrl.length / 1024))}KB（随正文保存）`,
          variant: 'success',
        })
      } catch (err) {
        toast({ title: `「${file.name}」插入失败：${err?.message || '未知错误'}`, variant: 'destructive' })
      }
    }
    if (inserted === 0) uploading.value = false
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <PublicLayout>
    <div class="flex flex-col gap-4 py-4 sm:py-5">
      <!-- 页头：标题 + 更新时间 + 管理员编辑入口 -->
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <BookOpen class="size-5 text-mid-gray" aria-hidden="true" />
            <h1 class="text-xl font-semibold leading-7 tracking-normal text-ink sm:text-2xl sm:leading-8">
              使用手册
            </h1>
          </div>
          <p v-if="!loading && !error && metaText" class="mt-1 text-sm text-mid-gray">
            {{ metaText }}
          </p>
        </div>

        <!-- 仅管理员可见编辑操作；普通用户/游客无任何编辑样式 -->
        <div v-if="canEdit && !loading && !error" class="flex items-center gap-2">
          <Button v-if="!editing" variant="outline" size="sm" @click="startEdit">
            <Pencil class="size-4" />
            编辑内容
          </Button>
          <template v-else>
            <Button variant="outline" size="sm" :disabled="saving" @click="cancelEdit">
              <X class="size-4" />
              取消
            </Button>
            <Button variant="default" size="sm" :disabled="saving" @click="save">
              <Save class="size-4" />
              {{ saving ? '保存中…' : '保存并发布' }}
            </Button>
          </template>
        </div>
      </div>

      <!-- 加载骨架 -->
      <Card v-if="loading" class="p-5 sm:p-8">
        <Skeleton class="mb-4 h-7 w-1/3" />
        <Skeleton class="mb-2 h-4 w-full" />
        <Skeleton class="mb-2 h-4 w-11/12" />
        <Skeleton class="mb-2 h-4 w-full" />
        <Skeleton class="mb-2 h-4 w-4/5" />
        <Skeleton class="mt-6 h-5 w-1/4" />
      </Card>

      <!-- 加载失败 -->
      <Card v-else-if="error" class="p-5 sm:p-8">
        <p class="text-sm text-ink">{{ error }}</p>
        <Button variant="outline" size="sm" class="mt-4" @click="load">重试</Button>
      </Card>

      <!-- 只读预览（普通用户 / 游客） -->
      <article v-else-if="!editing" class="md-article">
        <!-- eslint-disable-next-line vue/no-v-html -- 内容已由 DOMPurify 清洗（lib/markdown.js） -->
        <div class="md-body" v-html="html" />
      </article>

      <!-- ===== 管理员编辑态 ===== -->
      <div v-else class="flex flex-col gap-4">
        <Card class="p-4 sm:p-5">
          <div class="flex flex-wrap items-center gap-3">
            <Input
              v-model="draftTitle"
              class="min-w-[220px] max-w-xl flex-1 font-semibold"
              placeholder="手册标题"
            />
            <div class="ml-auto inline-flex rounded-2xl bg-canvas p-0.5 lg:hidden">
              <button
                type="button"
                :class="pane === 'write' ? 'bg-paper shadow-subtle text-ink' : 'text-mid-gray'"
                class="rounded-xl px-3 py-1.5 text-sm transition-colors"
                @click="pane = 'write'"
              >
                编辑
              </button>
              <button
                type="button"
                :class="pane === 'preview' ? 'bg-paper shadow-subtle text-ink' : 'text-mid-gray'"
                class="rounded-xl px-3 py-1.5 text-sm transition-colors"
                @click="pane = 'preview'"
              >
                预览
              </button>
            </div>
          </div>

          <!-- 快捷插入工具栏 -->
          <div class="mt-3 flex flex-wrap items-center gap-1 border-y border-hairline py-2">
            <!-- 上传本地图片：自动压缩 → data URL 内联进正文 -->
            <button
              type="button"
              title="上传图片（自动压缩并内联进正文）"
              class="inline-flex size-8 items-center justify-center rounded-xl bg-ink-soft text-surface-alt transition-opacity hover:opacity-85 disabled:opacity-50"
              :disabled="uploading"
              @click="triggerUpload"
            >
              <ImageUp class="size-4" aria-hidden="true" />
            </button>
            <span class="sr-only">{{ uploading ? '正在压缩图片…' : '上传图片' }}</span>
            <input
              ref="fileInput"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
              multiple
              class="hidden"
              @change="onPickImages"
            />

            <button
              v-for="action in toolActions"
              :key="action.label"
              type="button"
              :title="action.label"
              class="inline-flex size-8 items-center justify-center rounded-xl text-mid-gray transition-colors hover:bg-surface-alt hover:text-ink"
              @click="action.run(); focusEditor()"
            >
              <component :is="action.icon" class="size-4" aria-hidden="true" />
            </button>
            <span class="ml-auto hidden items-center gap-1 text-xs text-mid-gray sm:flex">
              {{ uploading ? '正在压缩图片…' : '插图上传：自动压缩（≤1440px）并随正文保存' }}
            </span>
          </div>

          <div class="mt-3 grid gap-4 lg:grid-cols-2">
            <!-- 左：Markdown 源码 -->
            <div :class="pane === 'write' ? 'block' : 'hidden lg:block'">
              <Textarea
                ref="editorEl"
                v-model="draftContent"
                :rows="26"
                class="min-h-[480px] bg-canvas font-mono text-[13px] leading-6"
                placeholder="在这里用 Markdown 编写手册内容…"
              />
            </div>
            <!-- 右：实时预览 -->
            <div :class="pane === 'preview' ? 'block' : 'hidden lg:block'">
              <div class="max-h-[640px] overflow-y-auto rounded-2xl border border-hairline bg-paper px-5 py-4 sm:px-6">
                <!-- eslint-disable-next-line vue/no-v-html -- 内容已由 DOMPurify 清洗（lib/markdown.js） -->
                <div class="md-body" v-html="previewHtml" />
              </div>
            </div>
          </div>

          <p class="mt-2 text-xs text-mid-gray">
            支持标题、表格、列表、引用、代码块与链接。插图：点左侧黑底图标选本地截图，自动压缩后以 data URL 内联（与正文一同保存，别人打开即是完整图文）；「图片占位」用于先标注再补图。{{ draftContent.length.toLocaleString() }} 字（上限 6,000,000）
          </p>
        </Card>
      </div>
    </div>
  </PublicLayout>
</template>
