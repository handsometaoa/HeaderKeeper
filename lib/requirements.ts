import type { LaneConfig, Requirement, SystemEntry } from './types';

/** 需求是否已过期（无过期时间视为永久有效） */
export function requirementExpired(requirement: Requirement, now: number = Date.now()): boolean {
  if (!requirement.expiresAt) return false;
  const t = Date.parse(requirement.expiresAt);
  return Number.isFinite(t) && now >= t;
}

/** 需求 id -> 需求 的索引 */
export function requirementMap(config: LaneConfig): Map<string, Requirement> {
  return new Map(config.requirements.map((r) => [r.id, r]));
}

export function requirementById(config: LaneConfig, id: string | null): Requirement | null {
  if (!id) return null;
  return config.requirements.find((r) => r.id === id) ?? null;
}

/** 系统引用的需求（保持 requirementIds 顺序，自动跳过悬空引用） */
export function systemRequirements(config: LaneConfig, system: SystemEntry): Requirement[] {
  const map = requirementMap(config);
  return system.requirementIds
    .map((id) => map.get(id))
    .filter((r): r is Requirement => r !== undefined);
}

/** 系统当前「使用中」的需求（不校验过期） */
export function activeRequirement(config: LaneConfig, system: SystemEntry): Requirement | null {
  const id = system.activeRequirementId;
  if (!id || !system.requirementIds.includes(id)) return null;
  return requirementById(config, id);
}

/** 系统当前真正会注入的需求：使用中且未过期 */
export function activeInjectableRequirement(
  config: LaneConfig,
  system: SystemEntry,
): Requirement | null {
  const requirement = activeRequirement(config, system);
  if (!requirement || requirementExpired(requirement)) return null;
  return requirement;
}

/** 引用了某个需求的系统 */
export function systemsReferencing(config: LaneConfig, requirementId: string): SystemEntry[] {
  return config.systems.filter((s) => s.requirementIds.includes(requirementId));
}

/** 按创建时间倒序；时间相同时保持原数组的倒序，保证稳定 */
export function sortRequirementsDesc(requirements: Requirement[]): Requirement[] {
  return requirements
    .map((requirement, index) => ({ requirement, index }))
    .sort(
      (a, b) =>
        b.requirement.createdAt - a.requirement.createdAt || b.index - a.index,
    )
    .map(({ requirement }) => requirement);
}

export type RequirementStatus = 'all' | 'valid' | 'expired';

export interface RequirementFilter {
  /** 需求名称关键词（不区分大小写） */
  name: string;
  /** Header 值关键词（不区分大小写） */
  headerValue: string;
  /** 过期状态筛选 */
  status: RequirementStatus;
}

export const emptyRequirementFilter: RequirementFilter = {
  name: '',
  headerValue: '',
  status: 'all',
};

/** 按名称 / Header 值 / 过期状态筛选 */
export function filterRequirements(
  requirements: Requirement[],
  filter: RequirementFilter,
): Requirement[] {
  const name = filter.name.trim().toLowerCase();
  const headerValue = filter.headerValue.trim().toLowerCase();
  return requirements.filter((requirement) => {
    if (name && !requirement.name.toLowerCase().includes(name)) return false;
    if (
      headerValue &&
      !requirement.headers.some((h) => h.value.toLowerCase().includes(headerValue))
    ) {
      return false;
    }
    if (filter.status !== 'all') {
      const expired = requirementExpired(requirement);
      if (filter.status === 'expired' && !expired) return false;
      if (filter.status === 'valid' && expired) return false;
    }
    return true;
  });
}
