import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

/**
 * 使用手册的 Markdown 渲染（t13）。
 *
 * 选择 markdown-it：纯 ESM、无框架绑定、可自定义渲染规则（本页需要「图片占位」规则）。
 * 管理员编辑的内容会渲染给所有用户（含游客），因此渲染结果必须经 DOMPurify 清洗，
 * markdown-it 本身也关闭了原始 HTML（html: false），双重防 XSS。
 */

/** 占位图约定：`![需要什么样的图](placeholder)`，src 为空同样按占位处理 */
const PLACEHOLDER_SRC = /^placeholder(:.*)?$/i
export const IMAGE_PLACEHOLDER_SRC = 'placeholder'

const md = new MarkdownIt({
  html: false, // 禁止正文内联 HTML，杜绝脚本注入
  xhtmlOut: false,
  breaks: false,
  langPrefix: 'language-',
  linkify: true,
  typographer: false,
})

/**
 * 标题锚点 slug：兼容中文标题（markdown-it 默认 slugify 会把中文全部剔除）。
 * 规则：小写 → 空白转连字符 → 仅保留 中日韩 / 字母 / 数字 / - _ → 合并连续连字符。
 * 例：「3.4 在 Chrome 中安装」→ 34-在-chrome-中安装
 */
function slugifyHeading(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{Script=Han}\p{L}\p{N}_-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

// 标题加 id：让正文里的目录锚点（[目录](#1-平台是什么)）可跳转
md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const inline = tokens[idx + 1]
  if (inline && inline.type === 'inline') {
    const slug = slugifyHeading(inline.content)
    if (slug) tokens[idx].attrSet('id', slug)
  }
  return self.renderToken(tokens, idx, options)
}

// 外链新窗口打开 + 防 tabnabbing
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href') || ''
  if (/^https?:\/\//i.test(href)) {
    tokens[idx].attrSet('target', '_blank')
    tokens[idx].attrSet('rel', 'noopener noreferrer')
  }
  return self.renderToken(tokens, idx, options)
}

/**
 * 图片规则：
 * - src 为占位（placeholder / 空）→ 渲染「待补充图片」提示框，展示需要的图片说明；
 * - 否则正常渲染，带懒加载与最大宽度约束。
 */
md.renderer.rules.image = (tokens, idx) => {
  const token = tokens[idx]
  const src = (token.attrGet('src') || '').trim()
  const alt = token.content || ''

  if (!src || PLACEHOLDER_SRC.test(src)) {
    const text = md.utils.escapeHtml(alt || '此处待补充图片')
    return [
      '<div class="md-figure-placeholder" role="note">',
      '<span class="md-figure-placeholder__badge">待补充图片</span>',
      `<span class="md-figure-placeholder__text">需要一张图：${text}</span>`,
      '</div>',
    ].join('')
  }

  if (!/^(https?:\/\/|\/|data:image\/)/i.test(src)) {
    // 非 http(s) / 站内路径 / data 图片（含 javascript: 等）一律按占位处理，避免注入
    const text = md.utils.escapeHtml(alt || '图片地址不被允许')
    return `<div class="md-figure-placeholder" role="note"><span class="md-figure-placeholder__badge">图片地址无效</span><span class="md-figure-placeholder__text">${text}</span></div>`
  }

  const escapedAlt = md.utils.escapeHtml(alt)
  return `<img src="${md.utils.escapeHtml(src)}" alt="${escapedAlt}" loading="lazy" class="md-figure" />`
}

/**
 * 渲染 Markdown 为可安全插入的 HTML 字符串。
 * @param {string} source Markdown 原文
 * @returns {string} 清洗后的 HTML
 */
export function renderMarkdown(source) {
  if (!source) return ''
  const raw = md.render(String(source))
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    // 保留渲染规则产出的 class（占位框 / 代码语言）；禁止 style 与事件属性
    ADD_ATTR: ['target', 'rel', 'loading'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'object', 'embed'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
    // 覆盖默认 URI 白名单：除 http(s)/mailto/tel、站内 / 、锚点 # 外，
    // 显式放行编辑器「上传图片」产出的 data:image/*;base64（默认策略不含 data:）。
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel):|\/|#|data:image\/(?:png|jpe?g|webp|gif|bmp);base64,)/i,
  })
}

/** 占位图提示文案（供编辑器插入示例用） */
export function placeholderImageSnippet(description = '简要说明这张图要展示什么') {
  return `![${description}](${IMAGE_PLACEHOLDER_SRC})`
}
