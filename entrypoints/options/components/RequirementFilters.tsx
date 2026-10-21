import type { T } from '@/lib/i18n';
import type { RequirementFilter, RequirementStatus } from '@/lib/requirements';
import { emptyRequirementFilter } from '@/lib/requirements';

/** 轻量筛选条：浅色底与需求卡片区分，过期状态使用下拉 */
export function RequirementFilters({
  value,
  onChange,
  t,
}: {
  value: RequirementFilter;
  onChange: (value: RequirementFilter) => void;
  t: T;
}) {
  const dirty =
    value.name.trim() !== '' || value.headerValue.trim() !== '' || value.status !== 'all';

  return (
    <div className="filters">
      <input
        type="text"
        className="filter-input"
        value={value.name}
        placeholder={t('filters.namePh')}
        aria-label={t('filters.name')}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
      />
      <input
        type="text"
        className="filter-input"
        value={value.headerValue}
        placeholder={t('filters.headerValuePh')}
        aria-label={t('filters.headerValue')}
        onChange={(e) => onChange({ ...value, headerValue: e.target.value })}
      />
      <div className="filter-select">
        <select
          value={value.status}
          aria-label={t('filters.status')}
          onChange={(e) =>
            onChange({ ...value, status: e.target.value as RequirementStatus })
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
      {dirty && (
        <button
          type="button"
          className="link-btn filter-clear"
          onClick={() => onChange(emptyRequirementFilter)}
        >
          {t('filters.clear')}
        </button>
      )}
    </div>
  );
}
