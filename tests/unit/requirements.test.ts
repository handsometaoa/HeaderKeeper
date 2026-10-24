import { describe, expect, it } from 'vitest';
import {
  displayRequirement,
  filterRequirements,
  requirementExpired,
  sortRequirementsDesc,
  systemRequirements,
  activeInjectableRequirement,
} from '@/lib/requirements';
import type { LaneConfig } from '@/lib/types';
import { requirement, system } from './helpers';

const cfg = (requirements: ReturnType<typeof requirement>[]) =>
  ({ version: 2, globalEnabled: true, requirements, systems: [] }) as unknown as LaneConfig;

describe('requirementExpired', () => {
  // 对齐整分钟（expiresAt 只有分钟精度），并用 NOW 反推本地时间串保证边界精确
  const NOW = 1_700_000_000_000 - (1_700_000_000_000 % 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = new Date(NOW);
  const atNow = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;

  it('now >= 过期时刻即过期（边界含等于）', () => {
    const r = requirement({ expiresAt: atNow });
    expect(requirementExpired(r, NOW)).toBe(true);
    expect(requirementExpired(r, NOW - 1)).toBe(false);
  });

  it('无过期时间或格式非法视为未过期', () => {
    expect(requirementExpired(requirement({ expiresAt: null }), NOW)).toBe(false);
    expect(requirementExpired(requirement({ expiresAt: 'not-a-date' }), NOW)).toBe(false);
  });
});

describe('sortRequirementsDesc', () => {
  it('按创建时间倒序，时间相同时保持原数组倒序（稳定）', () => {
    const a = requirement({ id: 'a', createdAt: 100 });
    const b = requirement({ id: 'b', createdAt: 300 });
    const c = requirement({ id: 'c', createdAt: 300 });
    const d = requirement({ id: 'd', createdAt: 200 });
    expect(sortRequirementsDesc([a, b, c, d]).map((r) => r.id)).toEqual(['c', 'b', 'd', 'a']);
  });
});

describe('displayRequirement', () => {
  it('未过期中最新一个', () => {
    const rOld = requirement({ id: 'old', createdAt: 100 });
    const rNew = requirement({ id: 'new', createdAt: 900 });
    const rExpiredNew = requirement({ id: 'exp', createdAt: 999, expiresAt: '2020-01-01T00:00' });
    expect(displayRequirement([rOld, rNew, rExpiredNew])?.id).toBe('new');
  });

  it('没有未过期时回退到已过期中最新一个', () => {
    const eOld = requirement({ id: 'e1', createdAt: 100, expiresAt: '2020-01-01T00:00' });
    const eNew = requirement({ id: 'e2', createdAt: 900, expiresAt: '2020-01-01T00:00' });
    expect(displayRequirement([eOld, eNew])?.id).toBe('e2');
  });

  it('空数组返回 null', () => {
    expect(displayRequirement([])).toBeNull();
  });
});

describe('filterRequirements', () => {
  const r1 = requirement({ id: 'r1', name: 'Feature-Cart改版', headers: [{ id: 'h', key: 'X-Lane', value: 'feature-cart' }] });
  const r2 = requirement({ id: 'r2', name: '结算优化', expiresAt: '2020-01-01T00:00' });

  it('默认筛选只保留未过期（status: valid）', () => {
    const out = filterRequirements([r1, r2], { name: '', headerValue: '', status: 'valid' });
    expect(out.map((r) => r.id)).toEqual(['r1']);
  });

  it('名称与 Header 值模糊匹配不区分大小写', () => {
    expect(
      filterRequirements([r1], { name: 'CART', headerValue: '', status: 'all' }).map((r) => r.id),
    ).toEqual(['r1']);
    expect(
      filterRequirements([r1], { name: 'checkout', headerValue: '', status: 'all' }),
    ).toHaveLength(0);
    expect(
      filterRequirements([r1, r2], { name: '', headerValue: 'FEATURE-CART', status: 'all' }).map(
        (r) => r.id,
      ),
    ).toEqual(['r1']);
  });

  it('expired 只保留已过期', () => {
    const out = filterRequirements([r1, r2], { name: '', headerValue: '', status: 'expired' });
    expect(out.map((r) => r.id)).toEqual(['r2']);
  });
});

describe('systemRequirements / activeInjectableRequirement', () => {
  const r1 = requirement({ id: 'r1' });
  const r2 = requirement({ id: 'r2', expiresAt: '2020-01-01T00:00' });
  const config = cfg([r1, r2]);
  const sys = system({ requirementIds: ['r1', 'r2', 'dangling'], activeRequirementId: 'r2' });

  it('保持 requirementIds 顺序并跳过悬空引用', () => {
    expect(systemRequirements(config, sys).map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('使用中的需求已过期时不注入', () => {
    expect(activeInjectableRequirement(config, sys)).toBeNull();
  });

  it('未过期时正常返回', () => {
    const ok = system({ requirementIds: ['r1', 'r2'], activeRequirementId: 'r1' });
    expect(activeInjectableRequirement(config, ok)?.id).toBe('r1');
  });
});
