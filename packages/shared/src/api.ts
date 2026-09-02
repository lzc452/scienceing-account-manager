import type {
  AccountStatus,
  AuditAction,
  AuditResult,
  LeaseStatus,
  ReleaseReason,
  UserRole,
} from './enums';

/**
 * API DTO 契约（PRD §40）。
 *
 * 命名约定：请求/响应 DTO 一律使用 camelCase（与 JSON 序列化一致）；
 * 后端内部数据库字段使用 snake_case，序列化时转换。
 *
 * 安全红线（PRD §41/§42/§58）：
 * - 科应密码仅在领取成功响应中一次性返回给租约持有人（R10），绝不进入日志/审计；
 * - 审计 metadata 禁止保存科应密码 / 管理员凭据 / 搜索词 / 页面内容 / 用户输入内容。
 */

/** ISO 8601 时间戳字符串（后端统一序列化，UTC） */
export type IsoTimestamp = string;

// ---------------------------------------------------------------------------
// 通用
// ---------------------------------------------------------------------------

export interface UserDto {
  id: number;
  username: string;
  displayName: string;
  department: string;
  role: UserRole;
  enabled: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// 认证（PRD §40）
// ---------------------------------------------------------------------------

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  /** 12 小时会话 token（PRD §5.2） */
  token: string;
  user: UserDto;
}

// ---------------------------------------------------------------------------
// 账号池（PRD §40 / §2.1 / §35）
// ---------------------------------------------------------------------------

/**
 * 账号池可用性统计（游客即可访问，不暴露密码/使用人/用户详情）。
 */
export interface AccountAvailabilityDto {
  total: number;
  available: number;
  inUse: number;
  recycling: number;
  /** 异常账号数（PRODUCT-DESIGN §5.1 Stat Block 第 4 项） */
  error: number;
}

// ---------------------------------------------------------------------------
// Lease（PRD §40 / §12 / §15 / §22 / §36）
// ---------------------------------------------------------------------------

export interface CreateLeaseRequest {
  /** 领取时浏览器插件的版本号（用于审计与 R4 版本校验） */
  extensionVersion?: string;
}

/** 科应账号凭据（仅领取成功响应中返回，R10） */
export interface AccountCredentialsDto {
  accountId: number;
  code: string;
  username: string;
  /** 明文科应密码（AES-256-GCM 解密后返回，PRD §41） */
  password: string;
}

export interface LeaseDto {
  id: number;
  accountId: number;
  accountCode: string;
  accountUsername: string;
  userId: number;
  status: LeaseStatus;
  startedAt: IsoTimestamp;
  lastActivityAt: IsoTimestamp;
  releaseRequestedAt: IsoTimestamp | null;
  releasedAt: IsoTimestamp | null;
  releaseReason: ReleaseReason | null;
  /** 预计释放时间（startedAt/lastActivityAt + inactivity_timeout_seconds） */
  expiresAt: IsoTimestamp;
  remainingSeconds: number;
}

export interface CreateLeaseResponse {
  /** 短期随机 token，仅此一次返回；数据库只存 SHA-256（PRD §43） */
  leaseToken: string;
  lease: LeaseDto;
  account: AccountCredentialsDto;
}

/**
 * 扩展查询 Lease 状态（PRD §15 GET /api/leases/{id}/status）。
 */
export interface LeaseStatusResponse {
  leaseId: number;
  status: LeaseStatus;
  accountCode: string;
  /** 使用人姓名（扩展绑定后用于悬浮窗展示） */
  displayName: string | null;
  lastActivityAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
  remainingSeconds: number;
  releasedAt: IsoTimestamp | null;
  releaseReason: ReleaseReason | null;
}

/**
 * Activity 上报响应（PRD §22）。
 */
export interface ActivityResponse {
  result: 'ACTIVE' | 'LEASE_EXPIRED';
  expiresAt: IsoTimestamp | null;
}

export interface ReleaseResponse {
  leaseId: number;
  status: LeaseStatus;
  releaseReason: ReleaseReason;
}

// ---------------------------------------------------------------------------
// 插件配置（PRD §11 / §40）
// ---------------------------------------------------------------------------

export interface ExtensionConfigDto {
  minimumVersion: string;
  latestVersion: string;
  activityThrottleSeconds: number;
  warningSeconds: number;
  criticalWarningSeconds: number;
}

// ---------------------------------------------------------------------------
// 管理员（PRD §40 / §37，PRODUCT-DESIGN §5.5–§5.9）
// ---------------------------------------------------------------------------

export interface AdminAccountDto {
  id: number;
  code: string;
  username: string;
  status: AccountStatus;
  /** 当前租约使用人姓名（仅管理员可见，PRD §35） */
  currentUser: string | null;
  lastPasswordChangedAt: IsoTimestamp | null;
  enabled: boolean;
  createdAt: IsoTimestamp;
}

/** 新增科应账号请求（管理员手工录入，密码由系统托管占位密文，PRD §37） */
export interface CreateAccountRequest {
  code: string;
  username: string;
}

/** CSV 批量导入账号请求（前端解析、二次确认后整批提交） */
export interface BulkCreateAccountsRequest {
  accounts: CreateAccountRequest[];
}

/** 批量导入结果（逐条插入，冲突/非法行归入 failed） */
export interface BulkCreateResult {
  created: number;
  failed: Array<{ code: string; reason: string }>;
}

export interface AdminUserDto extends UserDto {
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface CreateUserRequest {
  username: string;
  displayName: string;
  department: string;
  role: UserRole;
  password: string;
}

export interface UpdateUserRequest {
  displayName?: string;
  department?: string;
  role?: UserRole;
  enabled?: boolean;
  /** 重置登录密码（可选，管理员操作） */
  password?: string;
}

export interface AdminLeaseDto {
  id: number;
  /** 领取人姓名（管理员视图，PRD §37） */
  userDisplayName: string | null;
  accountCode: string;
  status: LeaseStatus;
  startedAt: IsoTimestamp;
  lastActivityAt: IsoTimestamp;
  releasedAt: IsoTimestamp | null;
  releaseReason: ReleaseReason | null;
}

export interface AuditLogDto {
  id: number;
  userId: number | null;
  accountId: number | null;
  leaseId: number | null;
  action: AuditAction;
  result: AuditResult;
  ip: string | null;
  userAgent: string | null;
  /** 禁止保存科应密码/管理员凭据/搜索词/页面内容/用户输入内容（PRD §58） */
  metadata: Record<string, unknown> | null;
  createdAt: IsoTimestamp;
}
