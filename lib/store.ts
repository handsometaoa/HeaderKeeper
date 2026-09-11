import { storage } from '#imports';
import type { HeaderPair, LaneConfig, Scheme } from './types';
import { normalizeConfig } from './ops';
import { uid } from './uid';

const CONFIG_KEY = 'local:laneConfig';

function pair(key: string, value: string): HeaderPair {
  return { id: uid(), key, value };
}

function scheme(name: string, description: string, headers: HeaderPair[]): Scheme {
  return { id: uid(), name, description, expiresAt: null, headers };
}

function defaultConfig(): LaneConfig {
  return {
    globalEnabled: true,
    systems: [
      {
        id: uid(),
        name: '运营后台',
        domains: ['admin.acme.cn'],
        enabled: true,
        activeSchemeId: null,
        schemes: [
          scheme('需求1', '张三 - 购物车改版', [pair('X-Lane', 'feature-cart-a')]),
          scheme('需求2', '李四 - 结算优化', [pair('X-Lane', 'feature-cart-b')]),
        ],
      },
    ],
  };
}

const configItem = storage.defineItem<LaneConfig>(CONFIG_KEY, {
  fallback: defaultConfig(),
});

export async function loadConfig(): Promise<LaneConfig> {
  const value = await configItem.getValue();
  // 旧版结构（rules: 规则→Header→候选值）自动迁移为新的 系统→需求方案 结构
  if (value !== null && !Array.isArray((value as LaneConfig).systems)) {
    const migrated = normalizeConfig(value);
    await configItem.setValue(migrated);
    return migrated;
  }
  return value;
}

export function saveConfig(config: LaneConfig): Promise<void> {
  return configItem.setValue(config);
}

/** 监听配置变化（任何页面保存后，所有上下文都能收到通知） */
export function watchConfig(cb: (config: LaneConfig) => void): () => void {
  // WXT 的 watch 回调签名是 (newValue, oldValue)
  return configItem.watch((value) => cb(value));
}
