// 轻量 i18n：中英词典 + t 函数。
// en 必须覆盖 zh 的全部键（en.ts 类型层面强制）。
export type Language = 'zh' | 'en';

export function normalizeLanguage(value: unknown): Language {
  return value === 'en' ? 'en' : 'zh';
}

import { zh } from './zh';
import { en } from './en';

export const messages = { zh, en };

export type MsgKey = keyof typeof zh;
export type T = (key: MsgKey, params?: Record<string, string | number>) => string;

export function createT(lang: Language): T {
  return (key, params) => {
    let text: string = messages[lang][key] ?? zh[key];
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(`{${k}}`, String(v));
      }
    }
    return text;
  };
}
