import type { Scheme, SystemEntry } from './types';

/** 方案是否已过期（无过期时间视为永久有效） */
export function schemeExpired(scheme: Scheme, now: number = Date.now()): boolean {
  if (!scheme.expiresAt) return false;
  const t = Date.parse(scheme.expiresAt);
  return Number.isFinite(t) && now >= t;
}

/** 系统当前真正生效的方案（存在、且未过期）；没有则返回 null */
export function activeInjectableScheme(system: SystemEntry): Scheme | null {
  const scheme = system.schemes.find((s) => s.id === system.activeSchemeId) ?? null;
  if (!scheme || schemeExpired(scheme)) return null;
  return scheme;
}
