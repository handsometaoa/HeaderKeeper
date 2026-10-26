import { useState } from 'react';
import { deleteRequirement } from '@/lib/ops';
import {
  emptyRequirementFilter,
  filterRequirements,
  sortRequirementsDesc,
  systemsReferencing,
} from '@/lib/requirements';
import type { LaneConfig, Requirement } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';
import { ConfirmModal } from './ConfirmModal';
import { RequirementCard } from './RequirementCard';
import { RequirementFilters } from './RequirementFilters';
import { RequirementFormModal } from './RequirementFormModal';
import { RequirementImportModal } from './RequirementImportModal';

export function RequirementsPanel({
  config,
  update,
  t,
  onOpenSystem,
  onToast,
}: {
  config: LaneConfig;
  update: Update;
  t: T;
  onOpenSystem: (systemId: string) => void;
  onToast: (text: string, variant: 'warn' | 'success') => void;
}) {
  const [filters, setFilters] = useState(emptyRequirementFilter);
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Requirement | null>(null);

  /** 导入成功：弹窗立即关闭，在需求页顶部提示结果 */
  const handleImported = (ok: number, skipped: number) => {
    onToast(
      skipped > 0 ? t('import.success', { ok, skipped }) : t('import.successOnly', { ok }),
      'success',
    );
  };

  const ordered = sortRequirementsDesc(config.requirements);
  const filtered = filterRequirements(ordered, filters);
  const deleteReferences = deleteTarget
    ? systemsReferencing(config, deleteTarget.id).length
    : 0;

  return (
    <section className="requirements-page">
      <div className="page-actions">
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
              onRequestDelete={setDeleteTarget}
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

      {deleteTarget && (
        <ConfirmModal
          title={t('requirements.deleteTitle')}
          message={
            deleteReferences > 0
              ? t('requirements.deleteWarning', { n: deleteReferences })
              : t('requirements.deleteWarningNone')
          }
          confirmLabel={t('requirements.deleteConfirm')}
          cancelLabel={t('common.cancel')}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            update((cfg) => deleteRequirement(cfg, deleteTarget.id));
            setDeleteTarget(null);
          }}
        />
      )}

      {importOpen && (
        <RequirementImportModal
          config={config}
          update={update}
          t={t}
          onClose={() => setImportOpen(false)}
          onImported={handleImported}
        />
      )}
    </section>
  );
}
