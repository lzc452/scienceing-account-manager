/**
 * 手册插图上传（t13 增强）
 *
 * 把本地图片压缩后转成 data URL 内联进 Markdown（随手册正文一起存库）：
 * - 不走后端文件上传，图与文档同生命周期，构建/清理不会丢；
 * - 适合教程截图这类文档配图；单张超预算会拒绝并提示压缩后再传。
 */

/** 压缩后图片最长边（截图通常 ≤1440px 足够清晰） */
export const IMAGE_MAX_WIDTH = 1440
/** JPEG/WebP 质量 */
export const IMAGE_QUALITY = 0.82
/**
 * 单张 data URL 字符预算 ≈ 1.1MB 图。超过说明压缩后仍过大（少见），
 * 提示改用更小截图；后端另有整篇正文 6,000,000 字符总上限。
 */
export const INLINE_IMAGE_CHAR_LIMIT = 1_500_000

const MIME_WHITELIST = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']

/** 校验文件类型；不在白名单（如 SVG）直接拒绝，避免脚本型图片进入正文。 */
export function checkImageFile(file) {
  if (!file) return '未选择文件'
  if (!(file instanceof File) || !MIME_WHITELIST.includes(file.type)) {
    return '仅支持 PNG / JPG / WebP / GIF / BMP 图片'
  }
  if (file.size > 30 * 1024 * 1024) return '原图超过 30MB，请先缩小后再上传'
  return null
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取该图片，请换一张重试'))
    }
    img.src = url
  })
}

/**
 * 读取本地图片 → 等比缩放到最长边 ≤ IMAGE_MAX_WIDTH → 压缩转 data URL。
 * 输出格式：优先 WebP（保留透明通道且体积小），不支持 WebP 时回退 JPEG。
 *
 * @param {File} file
 * @returns {Promise<{ dataUrl: string, width: number, height: number }>}
 */
export async function fileToInlineImage(file) {
  const typeError = checkImageFile(file)
  if (typeError) throw new Error(typeError)

  const img = await loadImage(file)
  const scale = Math.min(1, IMAGE_MAX_WIDTH / img.naturalWidth)
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持图片压缩')

  // PNG/WebP 带透明通道：WebP 可保留；JPEG 不透明底填白避免黑块
  const keepAlpha = file.type === 'image/png' || file.type === 'image/webp'
  if (!keepAlpha) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(img, 0, 0, width, height)

  const supportsWebp =
    typeof HTMLCanvasElement.prototype.toDataURL === 'function' &&
    canvas.toDataURL('image/webp').startsWith('data:image/webp')
  const mime = keepAlpha && supportsWebp ? 'image/webp' : 'image/jpeg'
  const dataUrl = canvas.toDataURL(mime, IMAGE_QUALITY)

  if (dataUrl.length > INLINE_IMAGE_CHAR_LIMIT) {
    throw new Error('压缩后图片仍过大（约 ' + Math.round(dataUrl.length / 1024) + 'KB），请把截图裁剪/缩小后再传')
  }
  return { dataUrl, width, height }
}

/** 由文件名生成图片说明（去扩展名，去下划线，最多 30 字）。 */
export function describeImageFile(file) {
  const base = (file.name || '截图').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ')
  return base.trim().slice(0, 30) || '截图'
}
