import type { LaneConfig } from './types';
import { matchSystems } from './domains';
import { activeInjectableRequirement } from './requirements';

interface HeaderConflict {
  /** 冲突的 Header Key（保留首次出现的大小写） */
  key: string;
  /** 注入该 Key 的系统名（去重） */
  systems: string[];
  /** 该 Key 实际注入的总行数：跨系统累计 + 同一需求内的重复行 */
  count: number;
}

/**
 * 检测同一域名下会互相覆盖的 Header Key 注入：
 * - 多个系统注入同一 Key（靠后的系统覆盖靠前的）；
 * - 同一需求内重复 Key（注入时 last-wins）。
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
      const entry = byKey.get(lower) ?? { key, systems: [], count: 0 };
      if (!entry.systems.includes(name)) entry.systems.push(name);
      entry.count += 1;
      byKey.set(lower, entry);
    }
  }
  return [...byKey.values()].filter((c) => c.count >= 2);
}
