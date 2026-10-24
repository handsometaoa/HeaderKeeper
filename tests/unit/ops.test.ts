import { describe, expect, it } from 'vitest';
import {
  addSystem,
  deleteRequirement,
  linkRequirement,
  parseImportedConfig,
  pruneEmptyHeaderPairs,
  quickCreateSystem,
  setActiveRequirement,
  unlinkRequirement,
} from '@/lib/ops';
import type { LaneConfig } from '@/lib/types';
import { header, requirement, system } from './helpers';

const cfg = (init: Partial<LaneConfig> = {}): LaneConfig =>
  ({
    version: 2,
    globalEnabled: true,
    requirements: init.requirements ?? [],
    systems: init.systems ?? [],
  }) as LaneConfig;

describe('需求选择', () => {
  const r1 = requirement({ id: 'r1' });
  const r2 = requirement({ id: 'r2' });
  const base = cfg({
    requirements: [r1, r2],
    systems: [system({ id: 's1', requirementIds: ['r1', 'r2'] })],
  });

  it('选中 → 再点同一个取消；未关联的需求不可选', () => {
    const on = setActiveRequirement(base, 's1', 'r1');
    expect(on.systems[0]!.activeRequirementId).toBe('r1');
    const off = setActiveRequirement(on, 's1', 'r1');
    expect(off.systems[0]!.activeRequirementId).toBeNull();
    const rejected = setActiveRequirement(base, 's1', 'dangling-id');
    expect(rejected.systems[0]!.activeRequirementId).toBeNull();
  });
});

describe('系统与需求的关联关系', () => {
  it('linkRequirement 幂等；unlink 同步清掉 active', () => {
    const r1 = requirement({ id: 'r1' });
    let config = cfg({ requirements: [r1], systems: [system({ id: 's1' })] });
    config = linkRequirement(config, 's1', 'r1');
    expect(config.systems[0]!.requirementIds).toEqual(['r1']);
    config = linkRequirement(config, 's1', 'r1');
    expect(config.systems[0]!.requirementIds).toEqual(['r1']); // 不重复
    config = setActiveRequirement(config, 's1', 'r1');
    config = unlinkRequirement(config, 's1', 'r1');
    expect(config.systems[0]!.requirementIds).toEqual([]);
    expect(config.systems[0]!.activeRequirementId).toBeNull();
  });

  it('deleteRequirement 清理所有系统引用与 active，共享库移除', () => {
    const r1 = requirement({ id: 'r1' });
    const config = cfg({
      requirements: [r1],
      systems: [
        system({ id: 's1', requirementIds: ['r1'], activeRequirementId: 'r1' }),
        system({ id: 's2', requirementIds: ['r1'] }),
      ],
    });
    const next = deleteRequirement(config, 'r1');
    expect(next.requirements).toHaveLength(0);
    expect(next.systems.every((s) => !s.requirementIds.includes('r1'))).toBe(true);
    expect(next.systems[0]!.activeRequirementId).toBeNull();
  });
});

describe('pruneEmptyHeaderPairs', () => {
  it('离开页面丢弃空 Key 行，全空时返回原引用', () => {
    const withEmpty = requirement({ headers: [header('X-K', 'v'), header('', 'x')] });
    const pruned = pruneEmptyHeaderPairs(cfg({ requirements: [withEmpty] }));
    expect(pruned.requirements[0]!.headers).toHaveLength(1);

    const clean = requirement({ headers: [header('X-K', 'v')] });
    const config = cfg({ requirements: [clean] });
    expect(pruneEmptyHeaderPairs(config)).toBe(config); // 无变化时复用引用
  });
});

describe('新建系统', () => {
  it('缺省名称自动编号：新建系统 → 新建系统 2', () => {
    const first = addSystem(cfg());
    expect(first.config.systems[0]!.name).toBe('新建系统');
    const second = addSystem(first.config);
    expect(second.config.systems[1]!.name).toBe('新建系统 2');
  });

  it('快捷创建：名称缺省用域名', () => {
    const next = quickCreateSystem(cfg(), '  ', 'admin.acme.cn');
    expect(next.systems[0]).toMatchObject({ name: 'admin.acme.cn', domains: ['admin.acme.cn'] });
  });
});

describe('parseImportedConfig（v2 清洗）', () => {
  it('非 v2 结构返回 null', () => {
    expect(parseImportedConfig({ version: 1, systems: [] })).toBeNull();
    expect(parseImportedConfig({ systems: [{ schemes: [] }] })).toBeNull();
    expect(parseImportedConfig(null)).toBeNull();
  });

  it('过滤悬空引用、active 指向未关联需求时归 null、域名归一化', () => {
    const raw = {
      version: 2,
      requirements: [{ id: 'r1', name: 'A', headers: [{ key: 'X-A', value: '1' }] }],
      systems: [
        {
          id: 's1',
          name: 'S1',
          domains: ['https://Example.com/path', '*.ops.test', 'bad domain'],
          requirementIds: ['r1', 'r1', 'dangling'],
          activeRequirementId: 'dangling',
        },
      ],
    };
    const parsed = parseImportedConfig(raw);
    expect(parsed?.systems[0]!.domains).toEqual(['example.com', '*.ops.test']);
    expect(parsed?.systems[0]!.requirementIds).toEqual(['r1']); // 去重 + 去悬空
    expect(parsed?.systems[0]!.activeRequirementId).toBeNull();
    expect(parsed?.requirements[0]!.headers[0]).toMatchObject({ key: 'X-A', value: '1' });
  });
});
