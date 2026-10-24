import { describe, expect, it } from 'vitest';
import { dedupeHeaders } from '@/lib/headers';
import { header } from './helpers';

describe('dedupeHeaders', () => {
  it('同 Key（忽略大小写与空格）后者覆盖前者并保留首次位置', () => {
    const out = dedupeHeaders([
      header('X-Lane', 'a'),
      header('Other', 'x'),
      header(' x-lane ', 'b'),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ key: ' x-lane ', value: 'b' });
    expect(out[1]).toMatchObject({ key: 'Other', value: 'x' });
  });

  it('空 Key 行不去重、原样保留', () => {
    const empties = [header('', ''), header('', 'v')];
    expect(dedupeHeaders(empties)).toHaveLength(2);
  });
});
