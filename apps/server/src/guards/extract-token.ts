/** 仅从 Authorization: Bearer 头提取 token（供 leaseToken 认证用）。 */
export function extractBearerToken(headers: Record<string, unknown>): string | null {
  const auth = headers['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }
  return null;
}

/** 从 Authorization: Bearer 头或 httpOnly `session` cookie 提取 token。 */
export function extractToken(headers: Record<string, unknown>): string | null {
  const bearer = extractBearerToken(headers);
  if (bearer) return bearer;

  const cookie = headers['cookie'];
  if (typeof cookie === 'string') {
    for (const part of cookie.split(';')) {
      const idx = part.indexOf('=');
      if (idx < 0) continue;
      if (part.slice(0, idx).trim() === 'session') {
        const value = part.slice(idx + 1).trim();
        if (value) return value;
      }
    }
  }

  return null;
}
