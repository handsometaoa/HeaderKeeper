import type { HeaderPair } from './types';

/**
 * 同一需求内按 Header Key 去重（忽略大小写与首尾空格）。
 * 后出现的覆盖先出现的值，保留第一次出现的位置。
 */
export function dedupeHeaders(headers: HeaderPair[]): HeaderPair[] {
  const result: HeaderPair[] = [];
  const indexByKey = new Map<string, number>();
  for (const header of headers) {
    const key = header.key.trim().toLowerCase();
    if (!key) {
      result.push(header);
      continue;
    }
    const existing = indexByKey.get(key);
    if (existing === undefined) {
      indexByKey.set(key, result.length);
      result.push(header);
    } else {
      result[existing] = header;
    }
  }
  return result;
}
