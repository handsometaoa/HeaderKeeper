import { describe, expect, it } from 'vitest';
import { findHeaderConflicts } from '@/lib/conflicts';
import type { LaneConfig } from '@/lib/types';
import { header, requirement, system } from './helpers';

const build = (
  systems: ReturnType<typeof system>[],
  requirements: ReturnType<typeof requirement>[],
): LaneConfig =>
  ({ version: 2, globalEnabled: true, requirements, systems }) as unknown as LaneConfig;

describe('findHeaderConflicts', () => {
  it('跨系统注入同一 Key 报冲突', () => {
    const r1 = requirement({ id: 'r1', headers: [header('X-Lane', 'a')] });
    const r2 = requirement({ id: 'r2', headers: [header('X-Lane', 'b')] });
    const config = build(
      [
        system({ id: 's1', name: '系统一', domains: ['acme.cn'], requirementIds: ['r1'], activeRequirementId: 'r1' }),
        system({ id: 's2', name: '系统二', domains: ['acme.cn'], requirementIds: ['r2'], activeRequirementId: 'r2' }),
      ],
      [r1, r2],
    );
    const conflicts = findHeaderConflicts(config, 'acme.cn');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ key: 'X-Lane', count: 2 });
    expect(conflicts[0]!.systems).toEqual(['系统一', '系统二']);
  });

  it('同一需求内重复 Key 也报冲突（count 累计）', () => {
    const r1 = requirement({
      id: 'r1',
      headers: [header('X-Same', 'a'), header('x-same', 'b')],
    });
    const config = build(
      [
        system({
          name: '唯一系统',
          domains: ['acme.cn'],
          requirementIds: ['r1'],
          activeRequirementId: 'r1',
        }),
      ],
      [r1],
    );
    const conflicts = findHeaderConflicts(config, 'acme.cn');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ count: 2, systems: ['唯一系统'] });
  });

  it('停用系统、过期需求、空键值不参与统计', () => {
    const rActive = requirement({ id: 'ra', headers: [header('X-K', '1')] });
    const rExpired = requirement({
      id: 're',
      expiresAt: '2020-01-01T00:00',
      headers: [header('X-K', '2')],
    });
    const config = build(
      [
        system({ domains: ['acme.cn'], requirementIds: ['ra'], activeRequirementId: 'ra' }),
        system({ enabled: false, domains: ['acme.cn'], requirementIds: ['re'], activeRequirementId: 're' }),
      ],
      [rActive, rExpired],
    );
    expect(findHeaderConflicts(config, 'acme.cn')).toHaveLength(0);
  });

  it('未匹配 host 的系统不计入', () => {
    const r1 = requirement({ headers: [header('X-K', '1')] });
    const config = build(
      [system({ domains: ['other.test'], requirementIds: [r1.id], activeRequirementId: r1.id })],
      [r1],
    );
    expect(findHeaderConflicts(config, 'acme.cn')).toHaveLength(0);
  });

  it('大小写不敏感归并同一 Key', () => {
    const r1 = requirement({ id: 'r1', headers: [header('X-Lane', 'a'), header('X-LANE', 'b')] });
    const config = build(
      [system({ domains: ['acme.cn'], requirementIds: ['r1'], activeRequirementId: 'r1' })],
      [r1],
    );
    const conflicts = findHeaderConflicts(config, 'acme.cn');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.key).toBe('X-Lane');
  });
});
