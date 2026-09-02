import { reactive } from 'vue'

export const toastState = reactive({ toasts: [] })

let seed = 0

/**
 * 弹出一条 toast（§6.1）：默认 6 秒自动消失，传 duration 0 表示不自动消失。
 */
export function toast(input) {
  const id = ++seed
  const item = { id, variant: 'default', duration: 6000, ...input }
  toastState.toasts.push(item)
  if (item.duration > 0) {
    window.setTimeout(() => dismissToast(id), item.duration)
  }
  return id
}

export function dismissToast(id) {
  const index = toastState.toasts.findIndex((t) => t.id === id)
  if (index >= 0) toastState.toasts.splice(index, 1)
}
