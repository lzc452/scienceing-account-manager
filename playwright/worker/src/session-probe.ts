/**
 * 会话探针公共模块（V1/V2/V3 验证脚本共用）。
 *
 * 解决的问题：**怎么客观判断「这个令牌还有效吗」**。
 *   - 看 URL / 看登录表单不靠谱：清空 localStorage 后科应 SPA 停在原页、只渲染空壳，
 *     不会跳登录页（V1 实测踩过）；
 *   - 看「有没有 2xx」也不靠谱：公开接口（配置、搜索建议）清空后照样 200（V2 实测踩过）。
 * 唯一可靠的做法是**重放受鉴权保护的业务接口**：匿名必 401、带令牌必 2xx。
 * 本模块负责：自动发现候选接口 → 校准出「受保护接口 + 鉴权头格式」→ 用当前令牌重放。
 *
 * 安全约束：令牌值全程只存在于页面上下文中，本模块只向外传状态码与键名。
 */

import type { Browser, Page, Response } from 'playwright';

export interface NetEntry {
  url: string;
  status: number;
  method: string;
  type: string;
}

export interface TokenMeta {
  isJwt: boolean;
  /** 令牌长度（值本身绝不输出）。 */
  length: number;
  issuedAt?: string;
  expiresAt?: string;
  claimCount?: number;
}

export interface ReplayPlan {
  paths: string[];
  tokenKey: string;
  mode: 'raw' | 'bearer';
}

/** 挂载同源响应采集器（只收 xhr/fetch）。 */
export function attachResponseCollector(
  page: Page,
  origin: string,
): { entries: NetEntry[]; detach: () => void } {
  const entries: NetEntry[] = [];
  const onResponse = (response: Response): void => {
    try {
      const request = response.request();
      const type = request.resourceType();
      if (type !== 'xhr' && type !== 'fetch') return;
      const target = response.url();
      if (origin && !target.startsWith(origin)) return;
      entries.push({ url: target, status: response.status(), method: request.method(), type });
    } catch {
      // 跳转中的响应，忽略
    }
  };
  page.on('response', onResponse);
  return { entries, detach: () => page.off('response', onResponse) };
}

/** 找出登录后存放令牌的 localStorage 键名（只返回键名）。 */
export async function findTokenKey(page: Page): Promise<string | null> {
  const keys = await page.evaluate(() => Object.keys(window.localStorage)).catch(() => [] as string[]);
  return (
    keys.find((key) => /authorization/i.test(key))
    ?? keys.find((key) => /token|jwt|session/i.test(key))
    ?? null
  );
}

/** 从候选响应里挑出可重放的 GET（排除危险动词与静态资源）。 */
export function collectCandidates(entries: NetEntry[], origin: string, limit = 12): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.method !== 'GET') continue;
    if (entry.status < 200 || entry.status >= 300) continue;
    let path = entry.url;
    try {
      const url = new URL(entry.url);
      if (origin && url.origin !== origin) continue;
      path = url.pathname;
    } catch {
      continue;
    }
    if (!path.startsWith('/')) continue;
    if (/logout|reset|delete|remove|update|save|create|export|download/i.test(path)) continue;
    if (/\.(js|css|png|jpe?g|svg|woff2?|ico|map)$/i.test(path)) continue;
    if (out.includes(path)) continue;
    out.push(path);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 校准：找出「匿名 401/403、带令牌 2xx」的接口，并试出 Authorization 头格式。
 * 校准不出来返回 null——此时不能拿未校准的探针下结论。
 */
export async function calibrateProtectedProbes(
  page: Page,
  candidates: string[],
  tokenKey: string,
): Promise<ReplayPlan | null> {
  if (candidates.length === 0) return null;
  const result = await page
    .evaluate(async (input) => {
      const raw = window.localStorage.getItem(input.tokenKey);
      if (!raw) return null;
      const detail: Array<{ path: string; anonymous: number; authed: number; mode: string }> = [];
      let authedMode: 'raw' | 'bearer' | null = null;

      for (const target of input.candidates) {
        let anonymous = -1;
        try {
          const res = await fetch(target, { method: 'GET', credentials: 'same-origin' });
          anonymous = res.status;
        } catch {
          anonymous = -1;
        }
        if (anonymous !== 401 && anonymous !== 403) continue;

        for (const mode of ['raw', 'bearer'] as const) {
          try {
            const headers = { Authorization: mode === 'bearer' ? `Bearer ${raw}` : raw };
            const res = await fetch(target, { method: 'GET', headers, credentials: 'same-origin' });
            if (res.status >= 200 && res.status < 300) {
              authedMode = authedMode ?? mode;
              if (authedMode === mode) detail.push({ path: target, anonymous, authed: res.status, mode });
              break;
            }
          } catch {
            // 试下一种格式
          }
        }
      }

      const paths: string[] = [];
      for (const item of detail) {
        if (!paths.includes(item.path) && paths.length < 4) paths.push(item.path);
      }
      return { paths, mode: authedMode, detail };
    }, { candidates, tokenKey })
    .catch(() => null);

  if (!result || !result.mode || result.paths.length === 0) return null;
  return { paths: result.paths, tokenKey, mode: result.mode };
}

/**
 * 用「当前 localStorage 里的令牌」重放探针。
 * 令牌已消失时自然不带鉴权头——这正是我们想测的状态。
 */
export async function probeWithToken(
  page: Page,
  paths: string[],
  tokenKey: string,
  mode: 'raw' | 'bearer',
): Promise<number[]> {
  return page
    .evaluate(async (input) => {
      const headers: Record<string, string> = {};
      const raw = window.localStorage.getItem(input.tokenKey);
      if (raw) headers.Authorization = input.mode === 'bearer' ? `Bearer ${raw}` : raw;
      const out: number[] = [];
      for (const target of input.paths) {
        try {
          const res = await fetch(target, { method: 'GET', headers, credentials: 'same-origin' });
          out.push(res.status);
        } catch {
          out.push(-1);
        }
      }
      return out;
    }, { paths, tokenKey, mode })
    .catch(() => [] as number[]);
}

/**
 * 用**显式传入**的令牌重放探针。
 *
 * 为什么需要：真正注销成功后站点会清空 localStorage 并可能整页跳转，
 * 从页面里再也读不到旧令牌，「旧令牌是否被吊销」就无从测起。
 * 因此注销前把令牌取到进程内存（只存在于变量里，绝不落盘/打印），注销后用它重放。
 */
export async function probeWithBearer(
  page: Page,
  paths: string[],
  token: string,
  mode: 'raw' | 'bearer',
): Promise<number[]> {
  return page
    .evaluate(async (input) => {
      const headers: Record<string, string> = {
        Authorization: input.mode === 'bearer' ? `Bearer ${input.token}` : input.token,
      };
      const out: number[] = [];
      for (const target of input.paths) {
        try {
          const res = await fetch(target, { method: 'GET', headers, credentials: 'same-origin' });
          out.push(res.status);
        } catch {
          out.push(-1);
        }
      }
      return out;
    }, { paths, token, mode })
    .catch(() => [] as number[]);
}

/** 解码令牌元信息（只取 exp/iat 与载荷键数量，绝不输出载荷内容）。 */export function readTokenMeta(page: Page, tokenKey: string): Promise<TokenMeta | null> {
  return page
    .evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return { isJwt: false, length: 0 };
      const parts = raw.split('.');
      const meta: { isJwt: boolean; length: number; issuedAt?: string; expiresAt?: string; claimCount?: number } = {
        isJwt: parts.length === 3,
        length: raw.length,
      };
      if (parts.length === 3) {
        try {
          const normalized = (parts[1] as string).replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(atob(normalized)) as Record<string, unknown>;
          meta.claimCount = Object.keys(payload).length;
          if (typeof payload.exp === 'number') meta.expiresAt = new Date(payload.exp * 1000).toISOString();
          if (typeof payload.iat === 'number') meta.issuedAt = new Date(payload.iat * 1000).toISOString();
        } catch {
          // 非标准 JWT 载荷
        }
      }
      return meta;
    }, tokenKey)
    .catch(() => null);
}

export interface CommonBody {
  returnCode: string | null;
  returnMsg: string | null;
}

/**
 * 解析科应统一响应体的 common 段。
 *
 * **HTTP 2xx 不代表成功**：注销接口裸调时就是 HTTP 200 + `returnCode=3002「数据加载失败」`。
 * 所有「这个请求算不算成功」的判断都必须看 returnCode，而不是状态码。
 */
export function parseCommon(text: string): CommonBody {
  try {
    const parsed = JSON.parse(text) as { common?: { returnCode?: unknown; returnMsg?: unknown } };
    const code = parsed.common?.returnCode;
    const msg = parsed.common?.returnMsg;
    return {
      returnCode: typeof code === 'string' ? code : (typeof code === 'number' ? String(code) : null),
      returnMsg: typeof msg === 'string' ? msg : null,
    };
  } catch {
    return { returnCode: null, returnMsg: null };
  }
}

/**
 * 在**全新浏览器上下文**里用给定令牌请求受保护接口。
 *
 * 为什么要新上下文：排除任何本地残留（cookie / localStorage / 内存状态）替我们「补」鉴权。
 * 新 profile 里什么状态都没有，如果还能 200，那只能是服务端自己认这个令牌——
 * 这是「服务端是否真的吊销」最硬的证据。
 */
export async function probeInFreshContext(
  browser: Browser,
  origin: string,
  paths: string[],
  token: string,
  mode: 'raw' | 'bearer',
): Promise<number[]> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/user/login`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    return await probeWithBearer(page, paths, token, mode);
  } finally {
    await Promise.race([
      context.close().catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
  }
}
