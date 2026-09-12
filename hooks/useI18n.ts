import { useCallback, useMemo } from 'react';
import { createT, normalizeLanguage } from '@/lib/i18n';
import type { Language } from '@/lib/i18n';
import type { LaneConfig } from '@/lib/types';
import { useLaneConfig } from './useLaneConfig';

/** 从已有的 config/update 派生语言与 t（适用于已在用 useLaneConfig 的页面） */
export function useLangFromConfig(
  config: LaneConfig | null,
  update: (fn: (config: LaneConfig) => LaneConfig) => void,
) {
  const lang: Language = normalizeLanguage(config?.language);
  const t = useMemo(() => createT(lang), [lang]);
  const setLang = useCallback(
    (l: Language) => update((cfg) => ({ ...cfg, language: normalizeLanguage(l) })),
    [update],
  );
  return { lang, t, setLang };
}

/** 独立使用（页面自身不依赖配置，如作者页） */
export function useI18n() {
  const { config, update } = useLaneConfig();
  return useLangFromConfig(config, update);
}
