import { browser, storage } from '#imports';
import type { HeaderPair, LaneConfig, Requirement } from '@/lib/types';
import { isV2Config } from '@/lib/ops';
import { uid } from '@/utils/uid';

const CONFIG_KEY = 'local:laneConfig';
/** 旧结构配置的备份键（不迁移，仅保留以便手动找回） */
const LEGACY_BACKUP_KEY = 'laneConfigLegacyBackup';

function pair(key: string, value: string): HeaderPair {
  return { id: uid(), key, value };
}

function requirement(
  createdAt: number,
  name: string,
  description: string,
  headers: HeaderPair[],
): Requirement {
  return { id: uid(), name, description, expiresAt: null, createdAt, headers };
}

function defaultConfig(): LaneConfig {
  const now = Date.now();
  const requirement1 = requirement(
    now - 1000,
    '需求1',
    '张三 - 购物车改版',
    [pair('X-Lane', 'feature-cart-a')],
  );
  const requirement2 = requirement(
    now,
    '需求2',
    '李四 - 结算优化',
    [pair('X-Lane', 'feature-cart-b')],
  );
  return {
    version: 2,
    globalEnabled: true,
    requirements: [requirement1, requirement2],
    systems: [
      {
        id: uid(),
        name: '运营后台',
        domains: ['admin.acme.cn'],
        enabled: true,
        requirementIds: [requirement1.id, requirement2.id],
        activeRequirementId: null,
      },
    ],
  };
}

const configItem = storage.defineItem<LaneConfig>(CONFIG_KEY, {
  fallback: defaultConfig(),
});

export async function loadConfig(): Promise<LaneConfig> {
  const value = await configItem.getValue();
  if (isV2Config(value)) return value;

  // 不迁移旧结构：先把旧配置备份一份，再重置为新版默认配置
  try {
    const existing = await browser.storage.local.get(LEGACY_BACKUP_KEY);
    if (existing[LEGACY_BACKUP_KEY] == null) {
      await browser.storage.local.set({ [LEGACY_BACKUP_KEY]: value });
    }
  } catch {
    // 备份失败不阻塞启动
  }

  const fresh = defaultConfig();
  await configItem.setValue(fresh);
  return fresh;
}

export function saveConfig(config: LaneConfig): Promise<void> {
  return configItem.setValue(config);
}

/** 监听配置变化（任何页面保存后，所有上下文都能收到通知） */
export function watchConfig(cb: (config: LaneConfig) => void): () => void {
  // WXT 的 watch 回调签名是 (newValue, oldValue)
  return configItem.watch((value) => cb(value));
}
