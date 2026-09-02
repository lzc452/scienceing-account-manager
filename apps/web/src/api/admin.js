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

export function getAdminUsers() {
  return USE_MOCK ? adminMockApi.listUsers() : http('GET', '/admin/users')
}

export function createUser(dto) {
  return USE_MOCK ? adminMockApi.createUser(dto) : http('POST', '/admin/users', dto)
}

export function updateUser(userId, dto) {
  return USE_MOCK ? adminMockApi.updateUser(userId, dto) : http('PATCH', `/admin/users/${userId}`, dto)
}

export function getAdminLeases() {
  return USE_MOCK ? adminMockApi.listLeases() : http('GET', '/admin/leases')
}

export function getAdminLogs(params) {
  if (USE_MOCK) return adminMockApi.listLogs(params)
  const qs = new URLSearchParams()
  if (params?.action) qs.set('action', params.action)
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
