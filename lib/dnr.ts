import type { LaneConfig } from './types';
import { domainBase } from './domains';
import { activeInjectableRequirement } from './requirements';

const ALL_RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other',
] as const;

export interface DnrModifyHeader {
  header: string;
  operation: 'set';
  value: string;
}

export interface DnrRule {
  id: number;
  priority: number;
  condition: {
    requestDomains: string[];
    resourceTypes: string[];
  };
  action: {
    type: 'modifyHeaders';
    requestHeaders: DnrModifyHeader[];
  };
}

/**
 * 把用户配置转换成 declarativeNetRequest 动态规则。
 * - 每个系统取其使用中的共享需求生成一条规则；无使用中需求或键值不全的系统跳过
 * - 系统列表越靠后 priority 越高（后配置的系统覆盖前面同名 Header）
 */
export function buildDnrRules(config: LaneConfig): DnrRule[] {
  if (!config.globalEnabled) return [];

  const rules: DnrRule[] = [];
  let nextId = 1;

  for (const system of config.systems) {
    if (system.enabled === false) continue;
    // requestDomains 不接受 `*.` 前缀，转成可匹配主体（本域 + 全部子域名）
    const domains = system.domains
      .map((d) => domainBase(d))
      .filter((d): d is string => d !== null);
    if (domains.length === 0) continue;
    const requirement = activeInjectableRequirement(config, system);
    // 无使用中需求或需求已过期：不注入
    if (!requirement) continue;

    // Header Key 大小写不敏感：同一需求内重复 Key 由后者覆盖
    const headers = new Map<string, { key: string; value: string }>();
    for (const pair of requirement.headers) {
      const key = pair.key.trim();
      if (!key || !pair.value.trim()) continue;
      headers.set(key.toLowerCase(), { key, value: pair.value });
    }
    if (headers.size === 0) continue;

    rules.push({
      id: nextId,
      priority: nextId,
      condition: {
        requestDomains: domains,
        resourceTypes: [...ALL_RESOURCE_TYPES],
      },
      action: {
        type: 'modifyHeaders',
        requestHeaders: [...headers.values()].map(({ key, value }) => ({
          header: key,
          operation: 'set',
          value,
        })),
      },
    });
    nextId++;
  }

  return rules;
}
