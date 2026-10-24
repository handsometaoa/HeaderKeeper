import { describe, expect, it } from 'vitest';
import { buildDnrRules } from '@/lib/dnr';
import type { LaneConfig } from '@/lib/types';
import { header, requirement, system } from './helpers';

const build = (
  systems: ReturnType<typeof system>[],
  requirements: ReturnType<typeof requirement>[],
  globalEnabled = true,
): LaneConfig =>
  ({ version: 2, globalEnabled, requirements, systems }) as unknown as LaneConfig;

describe('buildDnrRules', () => {
  it('全局关闭时不生成任何规则', () => {
    const r1 = requirement({ headers: [header('X-Lane', 'a')] });
    const config = build(
      [system({ requirementIds: [r1.id], activeRequirementId: r1.id })],
      [r1],
      false,
    );
    expect(buildDnrRules(config)).toEqual([]);
  });

  it('通配域名转成裸主体（requestDomains 不接受 *. 前缀）', () => {
    const r1 = requirement({ headers: [header('X-Lane', 'a')] });
    const config = build(
      [
        system({
          domains: ['*.admin.acme.cn', 'admin.acme.cn'],
          requirementIds: [r1.id],
          activeRequirementId: r1.id,
        }),
      ],
      [r1],
    );
    const rules = buildDnrRules(config);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.condition.requestDomains).toEqual(['admin.acme.cn', 'admin.acme.cn']);
  });

  it('停用系统 / 无使用中需求 / 已过期需求跳过', () => {
    const r1 = requirement({ id: 'r1', headers: [header('X-A', '1')] });
    const rExpired = requirement({ id: 'r2', expiresAt: '2020-01-01T00:00', headers: [header('X-B', '2')] });
    const config = build(
      [
        system({ enabled: false, requirementIds: ['r1'], activeRequirementId: 'r1' }),
        system({ requirementIds: ['r2'], activeRequirementId: 'r2' }),
        system({ requirementIds: ['r1', 'r2'], activeRequirementId: null }),
      ],
      [r1, rExpired],
    );
    expect(buildDnrRules(config)).toEqual([]);
  });

  it('系统列表越靠后 priority 越高（后配置覆盖前面同名 Header）', () => {
    const r1 = requirement({ id: 'r1', headers: [header('X-Lane', 'a')] });
    const r2 = requirement({ id: 'r2', headers: [header('X-Lane', 'b')] });
    const config = build(
      [
        system({ id: 's1', domains: ['a.test'], requirementIds: ['r1'], activeRequirementId: 'r1' }),
        system({ id: 's2', domains: ['b.test'], requirementIds: ['r2'], activeRequirementId: 'r2' }),
      ],
      [r1, r2],
    );
    const rules = buildDnrRules(config);
    expect(rules.map((r) => r.priority)).toEqual([1, 2]);
  });

  it('同一需求内重复 Key 后者覆盖（last-wins），空键值跳过', () => {
    const r1 = requirement({
      headers: [header('X-Lane', 'old'), header('x-lane', 'new'), header('', 'v'), header('X-Empty', ' ')],
    });
    const config = build(
      [system({ requirementIds: [r1.id], activeRequirementId: r1.id })],
      [r1],
    );
    const rules = buildDnrRules(config);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.action.requestHeaders).toEqual([
      { header: 'x-lane', operation: 'set', value: 'new' },
    ]);
  });
});
