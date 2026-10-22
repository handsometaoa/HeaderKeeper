import { useState } from 'react';
import { deleteSystem, setSystemEnabled } from '@/lib/ops';
import type { LaneConfig, SystemEntry } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';
import { ConfirmModal } from './ConfirmModal';
import { SystemFormModal } from './SystemFormModal';

function SystemRow({
  system,
  update,
  t,
  onOpen,
  onEdit,
  onDelete,
}: {
  system: SystemEntry;
  update: Update;
  t: T;
  onOpen: (systemId: string) => void;
  onEdit: (system: SystemEntry) => void;
  onDelete: (system: SystemEntry) => void;
}) {
  const enabled = system.enabled !== false;
  return (
    <div className="sys-row">
      <span className={`sys-dot${enabled && system.activeRequirementId ? ' on' : ''}`} />
      <div className="sys-row-main">
        <span className="sys-row-name disp">{system.name || t('settings.unnamedSystem')}</span>
        <span className="sys-row-domains">
          {system.domains.length === 0 ? (
            <span className="sys-row-nodomains">{t('domains.empty')}</span>
          ) : (
            system.domains.map((domain) => (
              <span className="domain-chip mini mono" key={domain}>
                {domain}
              </span>
            ))
          )}
        </span>
      </div>

      <div className="sys-row-actions">
        <button
          type="button"
          className="sys-row-action primary sys-row-manage"
          onClick={() => onOpen(system.id)}
        >
          {t('systems.manage')}({system.requirementIds.length})
        </button>
        <button
          type="button"
          className="sys-row-action sys-row-edit"
          onClick={() => onEdit(system)}
        >
          {t('systems.editTitle')}
        </button>
        <button
          type="button"
          className="sys-row-action sys-row-toggle"
          onClick={() =>
            update((cfg) => setSystemEnabled(cfg, system.id, !enabled))
          }
        >
          {enabled ? t('systems.disable') : t('systems.enable')}
        </button>
        <button
          type="button"
          className="sys-row-action danger sys-row-delete"
          title={t('systems.deleteTitle', { name: system.name })}
          onClick={() => onDelete(system)}
        >
          {t('systems.delete')}
        </button>
      </div>
    </div>
  );
}

export function SystemsPanel({
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
  const [formOpen, setFormOpen] = useState(false);
  const [editingSystem, setEditingSystem] = useState<SystemEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SystemEntry | null>(null);

  const openCreate = () => {
    setEditingSystem(null);
    setFormOpen(true);
  };

  const openEdit = (system: SystemEntry) => {
    setEditingSystem(system);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingSystem(null);
  };

  return (
    <section className="systems-page">
      <div className="page-actions">
        <span className="page-count mono">{t('systems.count', { n: config.systems.length })}</span>
        <button type="button" className="btn primary" onClick={openCreate}>
          {t('systems.new')}
        </button>
      </div>

      {config.systems.length === 0 ? (
        <div className="empty">{t('systems.empty')}</div>
      ) : (
        <div className="sys-list-page">
          {config.systems.map((system) => (
            <SystemRow
              key={system.id}
              system={system}
              update={update}
              t={t}
              onOpen={onOpenSystem}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {formOpen && (
        <SystemFormModal
          config={config}
          update={update}
          system={editingSystem ?? undefined}
          t={t}
          onClose={closeForm}
          onSaved={onOpenSystem}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title={t('systems.deleteTitle', {
            name: deleteTarget.name || t('settings.unnamedSystem'),
          })}
          message={t('systems.deleteNote')}
          confirmLabel={t('systems.deleteConfirm')}
          cancelLabel={t('common.cancel')}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const targetId = deleteTarget.id;
            update((cfg) => deleteSystem(cfg, targetId));
            setDeleteTarget(null);
          }}
        />
      )}
    </section>
  );
}
