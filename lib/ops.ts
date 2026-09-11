import type { HeaderPair, LaneConfig, Scheme, SystemEntry } from './types';
import { matchSystems, normalizeDomainToken } from './domains';
import { uid } from './uid';

export function updateSystem(
  config: LaneConfig,
  systemId: string,
  fn: (system: SystemEntry) => SystemEntry,
): LaneConfig {
  return { ...config, systems: config.systems.map((s) => (s.id === systemId ? fn(s) : s)) };
}

export function updateScheme(
  config: LaneConfig,
  systemId: string,
  schemeId: string,
  fn: (scheme: Scheme) => Scheme,
): LaneConfig {
  return updateSystem(config, systemId, (s) => ({
    ...s,
    schemes: s.schemes.map((sc) => (sc.id === schemeId ? fn(sc) : sc)),
  }));
}

/** 选中方案；再次选择同一个则取消（该系统不注入）。同一系统至多一个 ACTIVE 方案 */
export function setActiveScheme(
  config: LaneConfig,
  systemId: string,
  schemeId: string | null,
): LaneConfig {
  return updateSystem(config, systemId, (s) => ({
    ...s,
    activeSchemeId: schemeId && s.activeSchemeId === schemeId ? null : schemeId,
  }));
}

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

export interface HeaderConflict {
  /** 冲突的 Header Key（保留首次出现的大小写） */
  key: string;
  /** 同时注入该 Key 的系统名 */
  systems: string[];
}

/**
 * 检测同一域名下多个系统注入相同 Header Key 的冲突。
 * 只统计真正会注入的 Header：系统匹配 host 且开关开启、方案 ACTIVE 且未过期、键值非空。
 */
export function findHeaderConflicts(
  systems: SystemEntry[],
  host: string,
): HeaderConflict[] {
  const byKey = new Map<string, HeaderConflict>();
  for (const system of matchSystems(systems, host)) {
    if (system.enabled === false) continue;
    const scheme = activeInjectableScheme(system);
    if (!scheme) continue;
    const name = system.name || '未命名系统';
    for (const header of scheme.headers) {
      const key = header.key.trim();
      if (!key || !header.value.trim()) continue;
      const lower = key.toLowerCase();
      const entry = byKey.get(lower) ?? { key, systems: [] };
      if (!entry.systems.includes(name)) entry.systems.push(name);
      byKey.set(lower, entry);
    }
  }
  return [...byKey.values()].filter((c) => c.systems.length >= 2);
}

/** 系统级注入开关 */
export function setSystemEnabled(
  config: LaneConfig,
  systemId: string,
  enabled: boolean,
): LaneConfig {
  return updateSystem(config, systemId, (s) => ({ ...s, enabled }));
}

function newSystem(name: string, domains: string[]): SystemEntry {
  return {
    id: uid(),
    name,
    domains,
    enabled: true,
    activeSchemeId: null,
    schemes: [],
  };
}

function defaultNewSystemName(config: LaneConfig): string {
  const count = config.systems.filter((s) => s.name.startsWith('新建系统')).length;
  return count === 0 ? '新建系统' : `新建系统 ${count + 1}`;
}

/** 新建系统（带一个空的需求1方案），返回新配置与新建系统的 id */
export function addSystem(
  config: LaneConfig,
  init?: { name?: string; domains?: string[] },
): LaneConfig & { newId: string } {
  const name = init?.name?.trim() || defaultNewSystemName(config);
  const system = newSystem(name, init?.domains ?? []);
  return { ...config, systems: [...config.systems, system], newId: system.id };
}

/** Popup 快捷创建：以当前域名为域名建系统 */
export function quickCreateSystem(
  config: LaneConfig,
  name: string,
  host: string,
): LaneConfig {
  return { ...config, systems: [...config.systems, newSystem(name.trim() || host, [host])] };
}

export function deleteSystem(config: LaneConfig, systemId: string): LaneConfig {
  return { ...config, systems: config.systems.filter((s) => s.id !== systemId) };
}

/** 为系统添加需求方案（名称与描述由表单提供，必填） */
export function addScheme(
  config: LaneConfig,
  systemId: string,
  init: { name: string; description: string },
): LaneConfig {
  return updateSystem(config, systemId, (s) => ({
    ...s,
    schemes: [
      ...s.schemes,
      {
        id: uid(),
        name: init.name.trim(),
        description: init.description.trim(),
        expiresAt: null,
        headers: [{ id: uid(), key: '', value: '' }],
      },
    ],
  }));
}

export function deleteScheme(
  config: LaneConfig,
  systemId: string,
  schemeId: string,
): LaneConfig {
  return updateSystem(config, systemId, (s) => ({
    ...s,
    activeSchemeId: s.activeSchemeId === schemeId ? null : s.activeSchemeId,
    schemes: s.schemes.filter((sc) => sc.id !== schemeId),
  }));
}

export function addPair(config: LaneConfig, systemId: string, schemeId: string): LaneConfig {
  return updateScheme(config, systemId, schemeId, (sc) => ({
    ...sc,
    headers: [...sc.headers, { id: uid(), key: '', value: '' }],
  }));
}

export function updatePair(
  config: LaneConfig,
  systemId: string,
  schemeId: string,
  pairId: string,
  patch: Partial<Pick<HeaderPair, 'key' | 'value'>>,
): LaneConfig {
  return updateScheme(config, systemId, schemeId, (sc) => ({
    ...sc,
    headers: sc.headers.map((h) => (h.id === pairId ? { ...h, ...patch } : h)),
  }));
}

export function deletePair(
  config: LaneConfig,
  systemId: string,
  schemeId: string,
  pairId: string,
): LaneConfig {
  return updateScheme(config, systemId, schemeId, (sc) => ({
    ...sc,
    headers: sc.headers.filter((h) => h.id !== pairId),
  }));
}

// ---------- 导入 / 迁移时的结构清洗 ----------

/** 清洗新结构的单个系统 */
function cleanSystem(s: Record<string, unknown>): SystemEntry {
  const rawSchemes = Array.isArray(s.schemes) ? s.schemes : [];
  const schemes = rawSchemes
    .filter((sc): sc is Record<string, unknown> => typeof sc === 'object' && sc !== null)
    .map((sc) => {
      const rawPairs = Array.isArray(sc.headers) ? sc.headers : [];
      const headers = rawPairs
        .filter((h): h is Record<string, unknown> => typeof h === 'object' && h !== null)
        .map((h) => ({
          id: typeof h.id === 'string' && h.id ? h.id : uid(),
          key: typeof h.key === 'string' ? h.key : '',
          value: typeof h.value === 'string' ? h.value : '',
        }));
      return {
        id: typeof sc.id === 'string' && sc.id ? sc.id : uid(),
        name: typeof sc.name === 'string' ? sc.name : '需求',
        description: typeof sc.description === 'string' ? sc.description : '',
        expiresAt: typeof sc.expiresAt === 'string' && sc.expiresAt ? sc.expiresAt : null,
        headers,
      };
    });
  return {
    id: typeof s.id === 'string' && s.id ? s.id : uid(),
    name: typeof s.name === 'string' && s.name ? s.name : '未命名系统',
    domains: Array.isArray(s.domains)
      ? s.domains
          .filter((d): d is string => typeof d === 'string' && !!d.trim())
          .map((d) => normalizeDomainToken(d))
          .filter((d): d is string => d !== null)
      : [],
    enabled: s.enabled !== false,
    activeSchemeId:
      typeof s.activeSchemeId === 'string' && schemes.some((sc) => sc.id === s.activeSchemeId)
        ? s.activeSchemeId
        : null,
    schemes,
  };
}

/** 旧版（规则→Header→候选值）配置的系统转换 */
function legacyRuleToSystem(rule: Record<string, unknown>): SystemEntry {
  const rawHeaders = Array.isArray(rule.headers) ? rule.headers : [];
  const schemes: Scheme[] = rawHeaders
    .filter((h): h is Record<string, unknown> => typeof h === 'object' && h !== null)
    .map((h) => {
      const candidates = Array.isArray(h.candidates) ? h.candidates : [];
      const selected = candidates.find(
        (c): c is Record<string, unknown> =>
          typeof c === 'object' && c !== null && c.id === h.selectedId,
      );
      const key = typeof h.key === 'string' ? h.key : '';
      return {
        id: typeof h.id === 'string' && h.id ? h.id : uid(),
        name: key || '需求',
        description:
          typeof selected?.note === 'string' && selected.note
            ? selected.note
            : '由旧版配置迁移',
        expiresAt: null,
        headers: [
          { id: uid(), key, value: typeof selected?.value === 'string' ? selected.value : '' },
        ],
      };
    });
  return {
    id: typeof rule.id === 'string' && rule.id ? rule.id : uid(),
    name: typeof rule.name === 'string' && rule.name ? rule.name : '未命名系统',
    domains: Array.isArray(rule.domains)
      ? rule.domains.filter((d): d is string => typeof d === 'string' && !!d)
      : [],
    enabled: rule.enabled !== false,
    activeSchemeId: null,
    schemes,
  };
}

/** 导入/迁移时做一遍清洗，保证结构完整；兼容旧版 rules 结构 */
export function normalizeConfig(raw: unknown): LaneConfig {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const globalEnabled = src.globalEnabled !== false;

  let rawSystems = Array.isArray(src.systems) ? src.systems : [];
  if (rawSystems.length === 0 && Array.isArray(src.rules)) {
    rawSystems = src.rules.filter(
      (r): r is Record<string, unknown> => typeof r === 'object' && r !== null,
    );
  }

  const systems = rawSystems
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map((s) =>
      // 新结构读 schemes；旧结构（headers+candidates）走迁移转换
      Array.isArray(s.schemes) ? cleanSystem(s) : legacyRuleToSystem(s),
    );

  return { globalEnabled, systems };
}
