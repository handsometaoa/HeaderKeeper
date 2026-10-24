import { describe, expect, it } from 'vitest';
import { domainBase, matchSystems, normalizeDomainToken, parseDomainInput } from '@/lib/domains';
import { system } from './helpers';

describe('normalizeDomainToken', () => {
  it('保留用户书写的 *. 前缀', () => {
    expect(normalizeDomainToken('*.example.com')).toBe('*.example.com');
    expect(normalizeDomainToken('example.com')).toBe('example.com');
  });

  it('去协议/路径/端口并转小写', () => {
    expect(normalizeDomainToken('https://Example.com/path')).toBe('example.com');
    expect(normalizeDomainToken('example.com:8080')).toBe('example.com');
    expect(normalizeDomainToken('  EXAMPLE.com  ')).toBe('example.com');
  });

  it('不合法输入返回 null', () => {
    expect(normalizeDomainToken('')).toBeNull();
    expect(normalizeDomainToken('..')).toBeNull();
    expect(normalizeDomainToken('not a domain')).toBeNull();
    expect(normalizeDomainToken('http://')).toBeNull();
  });
});

describe('parseDomainInput', () => {
  it('支持中英文逗号、空格、换行分隔并去重', () => {
    expect(parseDomainInput('a.com, b.com，c.com\nd.com a.com')).toEqual([
      'a.com',
      'b.com',
      'c.com',
      'd.com',
    ]);
  });

  it('跳过不合法片段', () => {
    expect(parseDomainInput('ok.com, !!, *.good.com')).toEqual(['ok.com', '*.good.com']);
  });
});

describe('domainBase', () => {
  it('去掉 *. 前缀', () => {
    expect(domainBase('*.admin.acme.cn')).toBe('admin.acme.cn');
    expect(domainBase('admin.acme.cn')).toBe('admin.acme.cn');
  });
});

describe('matchSystems', () => {
  const systems = [
    system({ id: 'exact', domains: ['admin.acme.cn'] }),
    system({ id: 'wild', domains: ['*.ops.acme.cn'] }),
    system({ id: 'other', domains: ['other.test'] }),
  ];

  it('精确与通配写法都命中本域及子域', () => {
    const ids = (host: string) => matchSystems(systems, host).map((s) => s.id);
    expect(ids('admin.acme.cn')).toEqual(['exact']);
    // 精确写法也命中子域（DNR requestDomains 语义）
    expect(ids('sub.admin.acme.cn')).toEqual(['exact']);
    expect(ids('a.b.ops.acme.cn')).toEqual(['wild']);
    expect(ids('ops.acme.cn')).toEqual(['wild']);
    expect(ids('acme.cn')).toEqual([]);
    expect(ids('')).toEqual([]);
  });

  it('保持配置顺序', () => {
    const ordered = [systems[2]!, systems[0]!];
    expect(matchSystems(ordered, 'admin.acme.cn').map((s) => s.id)).toEqual(['exact']);
  });
});
