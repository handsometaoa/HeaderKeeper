import { useState } from 'react';
import {
  emptyRequirementFilter,
  filterRequirements,
  sortRequirementsDesc,
  systemsReferencing,
} from '@/lib/requirements';
import type { LaneConfig } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';
import { RequirementCard } from './RequirementCard';
import { RequirementFilters } from './RequirementFilters';
import { RequirementFormModal } from './RequirementFormModal';
import { RequirementImportModal } from './RequirementImportModal';

export function RequirementsPanel({
  config,
  update,
  t,
  onOpenSystem,
}: {
  config: LaneConfig;
  update: Update;
  t: T;
  onOpenSystem: (systemId: string) => void;
}) {
  const [filters, setFilters] = useState(emptyRequirementFilter);
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const ordered = sortRequirementsDesc(config.requirements);
  const filtered = filterRequirements(ordered, filters);

  return (
    <section className="requirements-page">
      <div className="page-actions">
        <span className="page-count mono">
          {t('requirements.count', { n: config.requirements.length })}
        </span>
        <div className="page-actions-actions">
          <button
            type="button"
            className="btn"
            onClick={() => setImportOpen(true)}
          >
            {t('requirements.import')}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => setCreateOpen(true)}
          >
            {t('requirements.new')}
          </button>
        </div>
      </div>

      <RequirementFilters value={filters} onChange={setFilters} t={t} />

      {config.requirements.length === 0 ? (
        <div className="empty">{t('requirements.empty')}</div>
      ) : filtered.length === 0 ? (
        <div className="req-empty">{t('requirements.noFiltered')}</div>
      ) : (
        <div className="req-list">
          {filtered.map((requirement) => (
            <RequirementCard
              key={requirement.id}
              requirement={requirement}
              references={systemsReferencing(config, requirement.id)}
              update={update}
              t={t}
              onOpenSystem={onOpenSystem}
            />
          ))}
        </div>
      )}

      {createOpen && (
        <RequirementFormModal
          config={config}
          update={update}
          t={t}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {importOpen && (
        <RequirementImportModal
          config={config}
          update={update}
          t={t}
          onClose={() => setImportOpen(false)}
        />
      )}
    </section>
  );
}
