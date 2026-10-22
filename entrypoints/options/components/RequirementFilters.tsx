import { useEffect, useState } from 'react';
import type { T } from '@/lib/i18n';
import type { RequirementFilter, RequirementStatus } from '@/lib/requirements';
import { emptyRequirementFilter } from '@/lib/requirements';

/**
 * 轻量筛选条：浅色底与需求卡片区分。
 * 输入/下拉只修改草稿，点击「搜索」才应用；「清除」同时清空草稿和应用条件。
 */
export function RequirementFilters({
  value,
  onChange,
  t,
}: {
  value: RequirementFilter;
  onChange: (value: RequirementFilter) => void;
  t: T;
}) {
  const [draft, setDraft] = useState<RequirementFilter>(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const search = () => onChange(draft);
  const clear = () => {
    setDraft(emptyRequirementFilter);
    onChange(emptyRequirementFilter);
  };

  return (
    <div className="filters">
      <input
        type="text"
        className="filter-input"
        value={draft.name}
        placeholder={t('filters.namePh')}
        aria-label={t('filters.name')}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            search();
          }
        }}
      />
      <input
        type="text"
        className="filter-input"
        value={draft.headerValue}
        placeholder={t('filters.headerValuePh')}
        aria-label={t('filters.headerValue')}
        onChange={(e) => setDraft({ ...draft, headerValue: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            search();
          }
        }}
      />
      <div className="filter-select">
        <select
          value={draft.status}
          aria-label={t('filters.status')}
          onChange={(e) =>
            setDraft({ ...draft, status: e.target.value as RequirementStatus })
          }
        >
          <option value="all">{t('filters.all')}</option>
          <option value="valid">{t('filters.valid')}</option>
          <option value="expired">{t('filters.expired')}</option>
        </select>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      <div className="filter-actions">
        <button type="button" className="btn primary filter-search" onClick={search}>
          {t('filters.search')}
        </button>
        <button type="button" className="link-btn filter-clear" onClick={clear}>
          {t('common.clear')}
        </button>
      </div>
    </div>
  );
}
