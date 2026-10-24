import type { HeaderPair, LaneConfig, Requirement } from './types';
import { dedupeHeaders } from './headers';
import { uid } from '@/utils/uid';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type ImportKeyType = 'id' | 'name';

export interface ImportConflict {
  name: string;
  /** 判定冲突使用的唯一键类型 */
  keyType: ImportKeyType;
  keyValue: string;
}

export interface ImportInvalid {
  /** 在原数组中的下标（从 0 开始） */
  index: number;
  name: string;
  reason: 'missing-name' | 'invalid-item';
}

export interface ImportPreview {
  total: number;
  accepted: Requirement[];
  conflicts: ImportConflict[];
  invalid: ImportInvalid[];
}

/**
 * 从解析结果中取出候选需求数组。
 * 支持：需求数组 / 单个需求对象 / { requirements: [...] }。
 * 不是可识别的结构时返回 null。
 */
export function extractCandidates(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw)) {
    if (Array.isArray(raw.requirements)) return raw.requirements;
    if (typeof raw.name === 'string') return [raw];
  }
  return null;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeHeaders(raw: unknown): HeaderPair[] {
  const entries: unknown[] = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? Object.entries(raw).map(([key, value]) => ({ key, value }))
      : [];

  const normalized = entries
    .filter(isRecord)
    .map((header) => ({
      id: uid(),
      key: normalizeString(header.key),
      value:
        typeof header.value === 'string'
          ? header.value
          : typeof header.value === 'number' && Number.isFinite(header.value)
            ? String(header.value)
            : '',
    }))
    .filter((header) => header.key !== '' || header.value !== '');
  return dedupeHeaders(normalized);
}

/** 过期时间：支持标准字符串或毫秒时间戳 */
function normalizeExpiresAt(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
        date.getHours(),
      )}:${pad(date.getMinutes())}`;
    }
  }
  return null;
}

/** 创建时间：缺失时按数组顺序生成，保证后出现的更新 */
function normalizeCreatedAt(raw: unknown, index: number, total: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now() - (total - index) * 1000;
}

/**
 * 把任意候选数据标准化为需求，并做唯一键检查。
 * 唯一键同时校验 id 与需求名称：任一在共享库（或本次导入列表）中已存在即视为冲突，
 * 冲突提示优先归因到 id。冲突项和格式无效项不会进入 accepted。
 */
export function prepareRequirementImport(
  config: LaneConfig,
  raw: unknown,
): ImportPreview | null {
  const candidates = extractCandidates(raw);
  if (!candidates) return null;

  const existingIds = new Set(config.requirements.map((r) => r.id));
  const existingNames = new Set(config.requirements.map((r) => r.name.trim()));
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  const accepted: Requirement[] = [];
  const conflicts: ImportConflict[] = [];
  const invalid: ImportInvalid[] = [];

  candidates.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      invalid.push({ index, name: '', reason: 'invalid-item' });
      return;
    }
    const name = normalizeString(candidate.name).trim();
    if (!name) {
      invalid.push({ index, name: '', reason: 'missing-name' });
      return;
    }

    const rawId = candidate.id;
    const id =
      typeof rawId === 'string'
        ? rawId.trim()
        : typeof rawId === 'number' && Number.isFinite(rawId)
          ? String(rawId)
          : '';
    const idConflict = !!id && (existingIds.has(id) || seenIds.has(id));
    const nameConflict = existingNames.has(name) || seenNames.has(name);

    if (id) seenIds.add(id);
    seenNames.add(name);

    if (idConflict || nameConflict) {
      conflicts.push({
        name,
        keyType: idConflict ? 'id' : 'name',
        keyValue: idConflict ? id : name,
      });
      return;
    }

    accepted.push({
      id: id || uid(),
      name,
      description: normalizeString(candidate.description),
      expiresAt: normalizeExpiresAt(candidate.expiresAt),
      createdAt: normalizeCreatedAt(candidate.createdAt, index, candidates.length),
      headers: normalizeHeaders(candidate.headers),
    });
  });

  return { total: candidates.length, accepted, conflicts, invalid };
}

/** 把预览中通过检查的需求追加到共享库 */
export function applyRequirementImport(
  config: LaneConfig,
  accepted: Requirement[],
): LaneConfig {
  return { ...config, requirements: [...config.requirements, ...accepted] };
}
