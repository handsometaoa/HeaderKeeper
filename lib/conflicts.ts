import type { LaneConfig } from './types';
import { matchSystems } from './domains';
import { activeInjectableRequirement } from './requirements';

export interface HeaderConflict {
  /** 冲突的 Header Key（保留首次出现的大小写） */
  key: string;
  /** 同时注入该 Key 的系统名 */
  systems: string[];
}

/**
 * 检测同一域名下多个系统注入相同 Header Key 的冲突。
 * 只统计真正会注入的 Header：系统匹配 host 且开关开启、需求使用中且未过期、键值非空。
 */
export function findHeaderConflicts(config: LaneConfig, host: string): HeaderConflict[] {
  const byKey = new Map<string, HeaderConflict>();
  for (const system of matchSystems(config.systems, host)) {
    if (system.enabled === false) continue;
    const requirement = activeInjectableRequirement(config, system);
    if (!requirement) continue;
    const name = system.name || '未命名系统';
    for (const header of requirement.headers) {
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
