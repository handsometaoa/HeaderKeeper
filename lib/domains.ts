import type { SystemEntry } from './types';

/** 提取域名的可匹配主体：去协议/路径/端口/`*.` 前缀；不合法返回 null */
function baseOf(token: string): string | null {
  let s = token.trim().toLowerCase();
  if (!s) return null;
  s = (s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split('/')[0] ?? '').split(':')[0] ?? '';
  if (s.startsWith('*.')) s = s.slice(2);
  if (!s || s.includes('..') || !/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(s)) return null;
  return s;
}

/**
 * 归一化单个域名输入，保留用户书写的 `*.` 通配前缀用于展示。
 * `*.example.com` -> `*.example.com`；`example.com` -> `example.com`。不合法返回 null。
 */
export function normalizeDomainToken(token: string): string | null {
  const t = token.trim();
  const base = baseOf(t);
  if (!base) return null;
  return /^\*\./.test(t) ? `*.${base}` : base;
}

/** 域名输入框文本 -> 域名数组（支持中英文逗号、空格、换行分隔） */
export function parseDomainInput(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[,，\s]+/)) {
    const d = normalizeDomainToken(part);
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

/** 匹配主体（去掉 `*.` 展示前缀） */
export function domainBase(pattern: string): string | null {
  return baseOf(pattern);
}

/** 域名模式是否命中 host（两种写法等价：命中本域与全部子域名） */
export function hostMatchesPattern(pattern: string, host: string): boolean {
  const p = domainBase(pattern);
  if (!p) return false;
  return host === p || host.endsWith(`.${p}`);
}

/** 系统是否命中 host */
export function systemMatches(system: SystemEntry, host: string): boolean {
  return system.domains.some((d) => hostMatchesPattern(d, host));
}

/** 找出命中 host 的系统（保持配置顺序） */
export function matchSystems(systems: SystemEntry[], host: string): SystemEntry[] {
  if (!host) return [];
  return systems.filter((s) => systemMatches(s, host));
}
