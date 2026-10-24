import { useState } from 'react';
import { deleteSystem, setSystemEnabled } from '@/lib/ops';
import { displayRequirement, requirementExpired } from '@/lib/requirements';
import type { LaneConfig, Requirement, SystemEntry } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';
import { ConfirmModal } from './ConfirmModal';
import { SystemFormModal } from './SystemFormModal';

function SystemRow({
  system,
  requirements,
  globalEnabled,
  update,
  t,
  onOpen,
  onEdit,
  onDelete,
}: {
  system: SystemEntry;
  requirements: Requirement[];
  globalEnabled: boolean;
  update: Update;
  t: T;
  onOpen: (systemId: string) => void;
  onEdit: (system: SystemEntry) => void;
  onDelete: (system: SystemEntry) => void;
}) {
  const enabled = system.enabled !== false;
  // 展示用需求：未过期中最新一个，没有才取已过期中最新一个
  const display = displayRequirement(
    requirements.filter((r) => system.requirementIds.includes(r.id)),
  );
  const globalOff = globalEnabled ? '' : t('systems.globalOffSuffix');

  let injectText: string;
  if (!enabled) {
    injectText = t('systems.injectPaused');
  } else if (!display) {
    injectText = t('systems.noLinked') + globalOff;
  } else {
    const expiredSuffix = requirementExpired(display)
      ? `（${t('requirement.expiredBadge')}）`
      : '';
    injectText = t('systems.injecting', { name: display.name }) + expiredSuffix + globalOff;
  }

  const visibleDomains = system.domains.slice(0, 2);
  const hiddenDomains = system.domains.length - visibleDomains.length;

  return (
    <div className="sys-row">
      <label
        className="switch mini sys-row-switch"
        title={enabled ? t('systems.disable') : t('systems.enable')}
      >
        <input
          type="checkbox"
          className="sys-row-toggle"
          checked={enabled}
          onChange={(e) => update((cfg) => setSystemEnabled(cfg, system.id, e.target.checked))}
        />
        <span className="track" />
      </label>

      <div className="sys-row-main">
        <span className="sys-row-name-line">
          <span className="sys-row-name disp">
            {system.name || t('settings.unnamedSystem')}
          </span>
          {!enabled && (
            <span className="disabled-badge mono">{t('systems.disabledBadge')}</span>
          )}
        </span>
        <button type="button" className="sys-row-inject" onClick={() => onOpen(system.id)}>
          {injectText}
        </button>
        <span className="sys-row-domains">
          {system.domains.length === 0 ? (
            <span className="sys-row-nodomains">{t('domains.empty')}</span>
          ) : (
            <>
              {visibleDomains.map((domain) => (
                <span className="domain-chip mini mono" key={domain}>
                  {domain}
                </span>
              ))}
              {hiddenDomains > 0 && (
                <span
                  className="domain-chip mini mono sys-row-domains-more"
                  title={system.domains.join('\n')}
                >
                  +{hiddenDomains}
                </span>
              )}
            </>
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
          {t('systems.editAction')}
        </button>
        <button
          type="button"
          className="sys-row-action danger sys-row-delete"
          title={t('systems.deleteTitle', { name: system.name })}
          onClick={() => onDelete(system)}
        >
          {t('systems.deleteAction')}
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
              requirements={config.requirements}
              globalEnabled={config.globalEnabled}
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
