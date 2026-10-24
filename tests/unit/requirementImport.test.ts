import { describe, expect, it } from 'vitest';
import { applyRequirementImport, prepareRequirementImport } from '@/lib/requirementImport';
import type { LaneConfig, Requirement } from '@/lib/types';
import { requirement } from './helpers';

const cfgWith = (requirements: Requirement[]): LaneConfig =>
  ({ version: 2, globalEnabled: true, requirements, systems: [] }) as unknown as LaneConfig;

describe('prepareRequirementImport — 候选结构识别', () => {
  it('支持数组 / 单对象 / { requirements: [...] }，其他结构返回 null', () => {
    const config = cfgWith([]);
    expect(prepareRequirementImport(config, [{ name: 'A' }])?.total).toBe(1);
    expect(prepareRequirementImport(config, { name: 'A' })?.total).toBe(1);
    expect(prepareRequirementImport(config, { requirements: [{ name: 'A' }] })?.total).toBe(1);
    expect(prepareRequirementImport(config, 'oops')).toBeNull();
    expect(prepareRequirementImport(config, 42)).toBeNull();
    expect(prepareRequirementImport(config, [1, 'x', null])?.invalid).toHaveLength(3);
  });
});

describe('prepareRequirementImport — 双键唯一性校验', () => {
  it('id 已存在 → 冲突并归因到 id', () => {
    const config = cfgWith([requirement({ id: 'exists', name: '已存在' })]);
    const preview = prepareRequirementImport(config, [{ id: 'exists', name: '新名字' }]);
    expect(preview?.accepted).toHaveLength(0);
    expect(preview?.conflicts[0]).toMatchObject({ keyType: 'id', keyValue: 'exists' });
  });

  it('id 是新的但名称已存在 → 按名称判冲突', () => {
    const config = cfgWith([requirement({ id: 'old-id', name: '同名需求' })]);
    const preview = prepareRequirementImport(config, [{ id: 'brand-new', name: '同名需求' }]);
    expect(preview?.accepted).toHaveLength(0);
    expect(preview?.conflicts[0]).toMatchObject({ keyType: 'name', keyValue: '同名需求' });
  });

  it('同一批导入内部 id 与名称都去重', () => {
    const config = cfgWith([]);
    const preview = prepareRequirementImport(config, [
      { name: '需求A' },
      { name: '需求A' }, // 批内名称重复
      { id: 'x', name: 'B' },
      { id: 'x', name: 'C' }, // 批内 id 重复（名称不同）
    ]);
    expect(preview?.accepted.map((r) => r.name)).toEqual(['需求A', 'B']);
    expect(preview?.conflicts).toHaveLength(2);
  });

  it('缺名称判无效；id 缺省自动生成', () => {
    const config = cfgWith([]);
    const preview = prepareRequirementImport(config, [{ description: '无名称' }, { name: '正常' }]);
    expect(preview?.invalid[0]).toMatchObject({ index: 0, reason: 'missing-name' });
    const accepted = preview?.accepted[0];
    expect(accepted?.name).toBe('正常');
    expect(accepted?.id).toBeTruthy();
  });
});

describe('prepareRequirementImport — 字段归一化', () => {
  const config = cfgWith([]);

  it('headers 支持数组与对象两种形态，数值转字符串', () => {
    const preview = prepareRequirementImport(config, [
      { name: 'A', headers: [{ key: 'X-A', value: 123 }] },
      { name: 'B', headers: { 'X-B': 'obj' } },
    ]);
    expect(preview?.accepted[0]!.headers[0]).toMatchObject({ key: 'X-A', value: '123' });
    expect(preview?.accepted[1]!.headers[0]).toMatchObject({ key: 'X-B', value: 'obj' });
  });

  it('expiresAt 支持字符串与毫秒时间戳；非法字符串原样透传（requirementExpired 会安全视为未过期）', () => {
    const ts = Date.UTC(2026, 11, 31, 15, 59); // 本地 23:59 (UTC+8)
    const preview = prepareRequirementImport(config, [
      { name: 'A', expiresAt: '2026-12-31T23:59' },
      { name: 'B', expiresAt: ts },
      { name: 'C', expiresAt: 'not-a-date' },
    ]);
    expect(preview!.accepted[0]!.expiresAt).toBe('2026-12-31T23:59');
    expect(preview!.accepted[1]!.expiresAt).toBeTypeOf('string');
    expect(preview!.accepted[2]!.expiresAt).toBe('not-a-date');
  });

  it('createdAt 缺失时按数组顺序生成，后出现的更新', () => {
    const preview = prepareRequirementImport(config, [{ name: 'A' }, { name: 'B' }]);
    const [a, b] = preview?.accepted ?? [];
    expect(b!.createdAt).toBeGreaterThan(a!.createdAt);
  });
});

describe('applyRequirementImport', () => {
  it('把通过检查的需求追加到共享库尾部', () => {
    const existing = [requirement({ id: 'old', name: '旧' })];
    const incoming = [requirement({ id: 'new', name: '新' })];
    const next = applyRequirementImport(cfgWith(existing), incoming);
    expect(next.requirements.map((r) => r.id)).toEqual(['old', 'new']);
  });
});
