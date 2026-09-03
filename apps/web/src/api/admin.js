import { USE_MOCK, http } from './index'
import { adminMockApi } from './admin-mock'

/**
 * 管理后台 API（admin 端点，全部要求 ADMIN 会话）。
 * 真实端点见 apps/server/src/modules/{admin,users,audit,extension,settings}。
 */

export function getAdminAccounts() {
  return USE_MOCK ? adminMockApi.listAccounts() : http('GET', '/admin/accounts')
}

export function forceRelease(accountId) {
  return USE_MOCK
    ? adminMockApi.forceRelease(accountId)
    : http('POST', `/admin/accounts/${accountId}/force-release`)
}

export function resetPassword(accountId) {
  return USE_MOCK
    ? adminMockApi.resetPassword(accountId)
    : http('POST', `/admin/accounts/${accountId}/reset-password`)
}

export function markAvailable(accountId) {
  return USE_MOCK
    ? adminMockApi.markAvailable(accountId)
    : http('POST', `/admin/accounts/${accountId}/mark-available`)
}

export function disableAccount(accountId) {
  return USE_MOCK
    ? adminMockApi.disable(accountId)
    : http('POST', `/admin/accounts/${accountId}/disable`)
}

export function enableAccount(accountId) {
  return USE_MOCK
    ? adminMockApi.enable(accountId)
    : http('POST', `/admin/accounts/${accountId}/enable`)
}

/** 修改账号名称（对应科应平台账号）：PATCH /admin/accounts/:id */
export function renameAccount(accountId, dto) {
  return USE_MOCK
    ? adminMockApi.renameAccount(accountId, dto)
    : http('PATCH', `/admin/accounts/${accountId}`, dto)
}

/** 新增科应账号：POST /admin/accounts { code, username } */
export function createAccount(dto) {
  return USE_MOCK ? adminMockApi.createAccount(dto) : http('POST', '/admin/accounts', dto)
}

/** 删除科应账号：DELETE /admin/accounts/:id */
export function deleteAccount(accountId) {
  return USE_MOCK
    ? adminMockApi.deleteAccount(accountId)
    : http('DELETE', `/admin/accounts/${accountId}`)
}

/** CSV 批量导入（前端解析、二次确认后整批提交）：POST /admin/accounts/bulk */
export function bulkCreateAccounts(accounts) {
  return USE_MOCK
    ? adminMockApi.bulkCreateAccounts(accounts)
    : http('POST', '/admin/accounts/bulk', { accounts })
}

export function getAdminUsers() {
  return USE_MOCK ? adminMockApi.listUsers() : http('GET', '/admin/users')
}

export function createUser(dto) {
  return USE_MOCK ? adminMockApi.createUser(dto) : http('POST', '/admin/users', dto)
}

/** CSV 批量导入（前端解析、二次确认后整批提交）：POST /admin/users/bulk */
export function bulkCreateUsers(users) {
  return USE_MOCK
    ? adminMockApi.bulkCreateUsers(users)
    : http('POST', '/admin/users/bulk', { users })
}

export function updateUser(userId, dto) {
  return USE_MOCK ? adminMockApi.updateUser(userId, dto) : http('PATCH', `/admin/users/${userId}`, dto)
}

export function getAdminLeases(params) {
  if (USE_MOCK) return adminMockApi.listLeases(params)
  const qs = new URLSearchParams()
  if (params?.status && params.status !== 'all') qs.set('status', params.status)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.pageSize) qs.set('pageSize', String(params.pageSize))
  return http('GET', `/admin/leases?${qs.toString()}`)
}

export function getAdminLogs(params) {
  if (USE_MOCK) return adminMockApi.listLogs(params)
  const qs = new URLSearchParams()
  if (params?.action) qs.set('action', params.action)
  if (params?.hideActivity) qs.set('hideActivity', params.hideActivity)
  qs.set('page', String(params?.page ?? 1))
  qs.set('pageSize', String(params?.pageSize ?? 20))
  return http('GET', `/admin/logs?${qs.toString()}`)
}

export function getSettings() {
  return USE_MOCK ? adminMockApi.getSettings() : http('GET', '/admin/settings')
}

export function updateSettings(dto) {
  return USE_MOCK ? adminMockApi.updateSettings(dto) : http('POST', '/admin/settings', dto)
}

export function getExtensionConfig() {
  return USE_MOCK ? adminMockApi.getExtensionConfig() : http('GET', '/extension/config')
}

export function runHealthCheck() {
  // 真实健康检查端点由 t12 提供；当前 mock。
  return USE_MOCK ? adminMockApi.runHealthCheck() : http('POST', '/admin/health-check')
}
