import { useEffect, useState } from 'react';
import { deleteSystem, setSystemEnabled } from '@/lib/ops';
import type { LaneConfig, SystemEntry } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';
import { SystemFormModal } from './SystemFormModal';

function SystemRow({
  system,
  update,
  t,
  onOpen,
  onDelete,
}: {
  system: SystemEntry;
  update: Update;
  t: T;
  onOpen: (systemId: string) => void;
  onDelete: (systemId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  const enabled = system.enabled !== false;
  return (
    <div
      className="sys-row"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(system.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(system.id);
        }
      }}
    >
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
      <span className="sys-row-count mono">
        {t('systems.reqCount', { n: system.requirementIds.length })}
      </span>
      <label
        className="switch mini sys-row-switch"
        title={enabled ? t('card.switchOffTitle') : t('card.switchOnTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => update((cfg) => setSystemEnabled(cfg, system.id, e.target.checked))}
        />
        <span className="track" />
      </label>
      <button
        type="button"
        className={`sys-row-delete${confirming ? ' confirming' : ''}`}
        title={confirming ? t('common.confirmAgain') : t('systems.deleteTitle')}
        onClick={(e) => {
          e.stopPropagation();
          if (confirming) onDelete(system.id);
          else setConfirming(true);
        }}
      >
        {confirming ? t('systems.deleteConfirm') : t('common.delete')}
      </button>
      <svg
        className="sys-row-chevron"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
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
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <section className="systems-page">
      <div className="page-actions">
        <span className="page-count mono">{t('systems.count', { n: config.systems.length })}</span>
        <button type="button" className="btn primary" onClick={() => setCreateOpen(true)}>
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
              onDelete={(id) => update((cfg) => deleteSystem(cfg, id))}
            />
          ))}
        </div>
      )}

      {createOpen && (
        <SystemFormModal
          config={config}
          update={update}
          t={t}
          onClose={() => setCreateOpen(false)}
          onCreated={onOpenSystem}
        />
      )}
    </section>
  );
}
