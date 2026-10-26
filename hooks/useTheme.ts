import { useEffect } from 'react';
import type { LaneConfig } from '@/lib/types';
import { normalizeTheme } from '@/lib/ops';

const THEME_KEY = 'hk-theme';

/** 把解析后的主题写到 <html data-theme> 并缓存，供 index.html 内联脚本防闪 */
function applyTheme(resolved: 'light' | 'dark') {
  document.documentElement.dataset.theme = resolved;
  try {
    localStorage.setItem(THEME_KEY, resolved);
  } catch {
    /* localStorage 不可用时跳过缓存 */
  }
}

/**
 * 在 React 渲染前应用缓存的明暗主题。
 * MV3 CSP 禁止扩展页面内联脚本，防闪逻辑从 index.html 内联脚本移到这里，
 * 由各入口 main.tsx 在挂载前同步调用。
 */
export function applyCachedTheme() {
  try {
    const cached = localStorage.getItem(THEME_KEY);
    if (cached === 'light' || cached === 'dark') {
      document.documentElement.dataset.theme = cached;
    }
  } catch {
    /* localStorage 不可用时保持默认 */
  }
}

/**
 * 主题应用：读取配置中的主题偏好（light/dark/system），
 * system 模式跟随 prefers-color-scheme 并实时响应系统切换。
 * popup 与 options 共用；config 未加载前保持 applyCachedTheme 设好的缓存值。
 */
export function useTheme(config: LaneConfig | null) {
  useEffect(() => {
    if (!config) return;
    const preference = normalizeTheme(config.theme);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    if (preference !== 'system') {
      applyTheme(preference);
      return;
    }

    const follow = () => applyTheme(media.matches ? 'dark' : 'light');
    follow();
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, [config?.theme]);
}
