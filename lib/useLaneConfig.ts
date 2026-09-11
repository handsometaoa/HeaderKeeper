import { useCallback, useEffect, useRef, useState } from 'react';
import { syncDnrRules } from './sync';
import { loadConfig, saveConfig, watchConfig } from './store';
import type { LaneConfig } from './types';

const SAVE_DEBOUNCE_MS = 200;

/**
 * Popup / Options 共用的配置状态：
 * - 加载后本地编辑（update）
 * - 编辑防抖自动保存
 * - 保存期间忽略其他页面的同步，避免回写覆盖输入
 */
export function useLaneConfig() {
  const [config, setConfig] = useState<LaneConfig | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    loadConfig().then((c) => {
      if (alive && !dirtyRef.current) setConfig(c);
    });
    const unwatch = watchConfig((c) => {
      if (!dirtyRef.current) setConfig(c);
    });
    return () => {
      alive = false;
      unwatch();
    };
  }, []);

  const update = useCallback((fn: (config: LaneConfig) => LaneConfig) => {
    dirtyRef.current = true;
    setConfig((prev) => (prev ? fn(prev) : prev));
  }, []);

  useEffect(() => {
    if (!config || !dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      saveConfig(config)
        .then(() => {
          dirtyRef.current = false;
          // 在当前页面直接应用 DNR 规则，立即生效（不依赖 Service Worker 唤醒）
          return syncDnrRules();
        })
        .catch(() => undefined);
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [config]);

  return { config, update };
}
