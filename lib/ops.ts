import type { HeaderPair, LaneConfig, Requirement, SystemEntry } from './types';
import { normalizeDomainToken } from './domains';
import { normalizeLanguage } from './i18n';
import { uid } from '@/utils/uid';

export function updateSystem(
  config: LaneConfig,
  systemId: string,
  fn: (system: SystemEntry) => SystemEntry,
): LaneConfig {
  return { ...config, systems: config.systems.map((s) => (s.id === systemId ? fn(s) : s)) };
}

export function updateRequirement(
  config: LaneConfig,
  requirementId: string,
  fn: (requirement: Requirement) => Requirement,
): LaneConfig {
  return {
    ...config,
    requirements: config.requirements.map((r) => (r.id === requirementId ? fn(r) : r)),
  };
}

/** 选中需求；再次选择同一个则取消。同一系统至多一个使用中的需求 */
export function setActiveRequirement(
  config: LaneConfig,
  systemId: string,
  requirementId: string | null,
): LaneConfig {
  return updateSystem(config, systemId, (s) => {
    if (requirementId && !s.requirementIds.includes(requirementId)) return s;
    return {
      ...s,
      activeRequirementId:
        requirementId && s.activeRequirementId === requirementId ? null : requirementId,
    };
  });
}

/** 系统级注入开关 */
export function setSystemEnabled(
  config: LaneConfig,
  systemId: string,
  enabled: boolean,
): LaneConfig {
  return updateSystem(config, systemId, (s) => ({ ...s, enabled }));
}

function defaultNewSystemName(config: LaneConfig): string {
  const count = config.systems.filter((s) => s.name.startsWith('新建系统')).length;
  return count === 0 ? '新建系统' : `新建系统 ${count + 1}`;
}

function newSystem(name: string, domains: string[]): SystemEntry {
  return {
    id: uid(),
    name,
    domains,
    enabled: true,
    requirementIds: [],
    activeRequirementId: null,
  };
}

export interface AddSystemResult {
  config: LaneConfig;
  systemId: string;
}

/** 新建系统（不带默认需求） */
export function addSystem(
  config: LaneConfig,
  init?: { name?: string; domains?: string[] },
): AddSystemResult {
  const name = init?.name?.trim() || defaultNewSystemName(config);
  const system = newSystem(name, init?.domains ?? []);
  return { config: { ...config, systems: [...config.systems, system] }, systemId: system.id };
}

/** Popup 快捷创建：以当前域名为域名建系统 */
export function quickCreateSystem(config: LaneConfig, name: string, host: string): LaneConfig {
  return { ...config, systems: [...config.systems, newSystem(name.trim() || host, [host])] };
}

export function deleteSystem(config: LaneConfig, systemId: string): LaneConfig {
  return { ...config, systems: config.systems.filter((s) => s.id !== systemId) };
}

export interface AddRequirementResult {
  config: LaneConfig;
  requirementId: string;
}

/** 在共享库新建需求；传 systemId 时同时关联到该系统 */
export function addRequirement(
  config: LaneConfig,
  init: { name: string; description: string },
  systemId?: string,
): AddRequirementResult {
  const requirement: Requirement = {
    id: uid(),
    name: init.name.trim(),
    description: init.description.trim(),
    expiresAt: null,
    createdAt: Date.now(),
    headers: [{ id: uid(), key: '', value: '' }],
  };
  let next: LaneConfig = { ...config, requirements: [...config.requirements, requirement] };
  if (systemId) next = linkRequirement(next, systemId, requirement.id);
  return { config: next, requirementId: requirement.id };
}

/** 把已有需求关联到系统（已关联则不变） */
export function linkRequirement(
  config: LaneConfig,
  systemId: string,
  requirementId: string,
): LaneConfig {
  if (!config.requirements.some((r) => r.id === requirementId)) return config;
  return updateSystem(config, systemId, (s) =>
    s.requirementIds.includes(requirementId)
      ? s
      : { ...s, requirementIds: [...s.requirementIds, requirementId] },
  );
}

/** 从系统移出需求（仅解除引用，共享需求本身保留） */
export function unlinkRequirement(
  config: LaneConfig,
  systemId: string,
  requirementId: string,
): LaneConfig {
  return updateSystem(config, systemId, (s) => ({
    ...s,
    requirementIds: s.requirementIds.filter((id) => id !== requirementId),
    activeRequirementId:
      s.activeRequirementId === requirementId ? null : s.activeRequirementId,
  }));
}

/** 从共享库删除需求，同时清理所有系统的引用与 active 状态 */
export function deleteRequirement(config: LaneConfig, requirementId: string): LaneConfig {
  return {
    ...config,
    requirements: config.requirements.filter((r) => r.id !== requirementId),
    systems: config.systems.map((s) => {
      if (!s.requirementIds.includes(requirementId) && s.activeRequirementId !== requirementId) {
        return s;
      }
      return {
        ...s,
        requirementIds: s.requirementIds.filter((id) => id !== requirementId),
        activeRequirementId:
          s.activeRequirementId === requirementId ? null : s.activeRequirementId,
      };
    }),
  };
}

export function addPair(config: LaneConfig, requirementId: string): LaneConfig {
  return updateRequirement(config, requirementId, (r) => ({
    ...r,
    headers: [...r.headers, { id: uid(), key: '', value: '' }],
  }));
}

export function updatePair(
  config: LaneConfig,
  requirementId: string,
  pairId: string,
  patch: Partial<Pick<HeaderPair, 'key' | 'value'>>,
): LaneConfig {
  return updateRequirement(config, requirementId, (r) => ({
    ...r,
    headers: r.headers.map((h) => (h.id === pairId ? { ...h, ...patch } : h)),
  }));
}

export function deletePair(
  config: LaneConfig,
  requirementId: string,
  pairId: string,
): LaneConfig {
  return updateRequirement(config, requirementId, (r) => ({
    ...r,
    headers: r.headers.filter((h) => h.id !== pairId),
  }));
}

// ---------- 导入时的 v2 结构清洗 ----------

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanHeaders(raw: unknown): HeaderPair[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((h) => ({
      id: typeof h.id === 'string' && h.id ? h.id : uid(),
      key: typeof h.key === 'string' ? h.key : '',
      value: typeof h.value === 'string' ? h.value : '',
    }));
}

/** 是否是当前版本（v2 共享需求库）的配置结构 */
export function isV2Config(value: unknown): value is LaneConfig {
  if (!isRecord(value) || value.version !== 2) return false;
  if (!Array.isArray(value.requirements) || !Array.isArray(value.systems)) return false;
  return value.systems.every(
    (s) => isRecord(s) && Array.isArray(s.requirementIds) && !Array.isArray(s.schemes),
  );
}

/** 清洗 v2 配置：补全字段、过滤悬空引用、保证 active 引用合法 */
export function normalizeConfig(raw: unknown): LaneConfig {
  const src = isRecord(raw) ? raw : {};
  const globalEnabled = src.globalEnabled !== false;

  const rawRequirements = Array.isArray(src.requirements) ? src.requirements : [];
  const requirements: Requirement[] = rawRequirements.filter(isRecord).map((r, index) => ({
    id: typeof r.id === 'string' && r.id ? r.id : uid(),
    name: typeof r.name === 'string' ? r.name : '需求',
    description: typeof r.description === 'string' ? r.description : '',
    expiresAt: typeof r.expiresAt === 'string' && r.expiresAt ? r.expiresAt : null,
    createdAt:
      typeof r.createdAt === 'number' && Number.isFinite(r.createdAt)
        ? r.createdAt
        : Date.now() - (rawRequirements.length - index) * 1000,
    headers: cleanHeaders(r.headers),
  }));
  const requirementIds = new Set(requirements.map((r) => r.id));

  const rawSystems = Array.isArray(src.systems) ? src.systems : [];
  const systems: SystemEntry[] = rawSystems.filter(isRecord).map((s) => {
    const linkedIds = Array.isArray(s.requirementIds)
      ? [...new Set(s.requirementIds.filter((id): id is string => typeof id === 'string'))].filter(
          (id) => requirementIds.has(id),
        )
      : [];
    const active =
      typeof s.activeRequirementId === 'string' && linkedIds.includes(s.activeRequirementId)
        ? s.activeRequirementId
        : null;
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
      requirementIds: linkedIds,
      activeRequirementId: active,
    };
  });

  return {
    version: 2,
    globalEnabled,
    language: normalizeLanguage(src.language),
    requirements,
    systems,
  };
}

/** 解析导入文件；非 v2 结构返回 null（不做旧版迁移） */
export function parseImportedConfig(raw: unknown): LaneConfig | null {
  if (!isV2Config(raw)) return null;
  return normalizeConfig(raw);
}
