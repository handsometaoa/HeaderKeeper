import type { Requirement, SystemEntry } from '@/lib/types';

let seq = 0;

export function header(key: string, value: string) {
  return { id: `h${++seq}`, key, value };
}

export function requirement(init: Partial<Requirement> = {}): Requirement {
  return {
    id: init.id ?? `r${++seq}`,
    name: init.name ?? `需求${seq}`,
    description: init.description ?? '',
    expiresAt: init.expiresAt ?? null,
    createdAt: init.createdAt ?? 1000,
    headers: init.headers ?? [],
  };
}

export function system(init: Partial<SystemEntry> = {}): SystemEntry {
  return {
    id: init.id ?? `s${++seq}`,
    name: init.name ?? `系统${seq}`,
    domains: init.domains ?? ['example.com'],
    enabled: init.enabled ?? true,
    requirementIds: init.requirementIds ?? [],
    activeRequirementId: init.activeRequirementId ?? null,
  };
}
