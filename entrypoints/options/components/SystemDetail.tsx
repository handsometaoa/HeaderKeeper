import { useEffect, useState } from 'react';
import {
  deleteSystem,
  linkRequirement,
  setSystemEnabled,
  updateSystem,
} from '@/lib/ops';
import {
  emptyRequirementFilter,
  filterRequirements,
  sortRequirementsDesc,
  systemRequirements,
  systemsReferencing,
} from '@/lib/requirements';
import type { LaneConfig, SystemEntry } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';
import { DomainEditor } from './DomainEditor';
import { RequirementCard } from './RequirementCard';
import { RequirementFilters } from './RequirementFilters';
import { RequirementFormModal } from './RequirementFormModal';
import { RequirementPicker } from './RequirementPicker';

export function SystemDetail({
  config,
  system,
  update,
  t,
  onBack,
  onOpenSystem,
}: {
  config: LaneConfig;
  system: SystemEntry;
  update: Update;
  t: T;
  onBack: () => void;
  onOpenSystem: (systemId: string) => void;
}) {
  const [nameDraft, setNameDraft] = useState(system.name);
  const [nameError, setNameError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filters, setFilters] = useState(emptyRequirementFilter);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setNameDraft(system.name);
    setNameError('');
  }, [system.id, system.name]);

  useEffect(() => {
    if (!confirmingDelete) return;
    const timer = window.setTimeout(() => setConfirmingDelete(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmingDelete]);

  const linked = systemRequirements(config, system);
  const filtered = filterRequirements(sortRequirementsDesc(linked), filters);
  const unlinked = config.requirements.filter(
    (requirement) => !system.requirementIds.includes(requirement.id),
  );

  /** 输入时即时校验并保存；重名/空名只提示，不写入配置 */
  const handleNameChange = (value: string) => {
    setNameDraft(value);
    const name = value.trim();
    if (!name) {
      setNameError(t('systems.nameRequired'));
      return;
    }
    if (config.systems.some((s) => s.id !== system.id && s.name === name)) {
      setNameError(t('systems.nameDuplicate'));
      return;
    }
    setNameError('');
    if (name !== system.name) {
      update((cfg) => updateSystem(cfg, system.id, (s) => ({ ...s, name })));
    }
  };

  const setDomains = (domains: string[]) =>
    update((cfg) => updateSystem(cfg, system.id, (s) => ({ ...s, domains })));

  return (
    <section className="system-detail">
      <button type="button" className="link-btn back-link" onClick={onBack}>
        {t('systems.back')}
      </button>

      <div className="panel-card system-info">
        <div className="system-info-head">
          <label className="edit-label system-name-field">
            {t('systems.nameLabel')}
            <input
              type="text"
              value={nameDraft}
              placeholder={t('systems.namePh')}
              onChange={(e) => handleNameChange(e.target.value)}
              onBlur={() => {
                const name = nameDraft.trim();
                if (!name) {
                  setNameError(t('systems.nameRequired'));
                } else if (
                  config.systems.some((s) => s.id !== system.id && s.name === name)
                ) {
                  setNameError(t('systems.nameDuplicate'));
                }
              }}
            />
          </label>
          <div className="system-info-actions">
            <span className="system-info-status mono">
              {t('systems.reqCount', { n: system.requirementIds.length })}
            </span>
            <label
              className="switch system-enable"
              title={
                system.enabled !== false ? t('card.switchOffTitle') : t('card.switchOnTitle')
              }
            >
              <input
                type="checkbox"
                checked={system.enabled !== false}
                onChange={(e) =>
                  update((cfg) => setSystemEnabled(cfg, system.id, e.target.checked))
                }
              />
              <span className="track" />
            </label>
          </div>
        </div>

        <div className="system-info-body">
          {nameError && <div className="form-error">{nameError}</div>}

          <div className="system-domains-field">
            <div className="edit-label">{t('systems.domainsLabel')}</div>
            <DomainEditor domains={system.domains} onChange={setDomains} t={t} />
          </div>

          <div className="system-info-foot">
            <span className="system-info-note">{t('systems.deleteNote')}</span>
            <button
              type="button"
              className={`link-btn danger${confirmingDelete ? ' confirming' : ''}`}
              title={t('systems.deleteTitle')}
              onClick={() => {
                if (confirmingDelete) {
                  update((cfg) => deleteSystem(cfg, system.id));
                  onBack();
                } else {
                  setConfirmingDelete(true);
                }
              }}
            >
              {confirmingDelete ? t('systems.deleteConfirm') : t('systems.delete')}
            </button>
          </div>
        </div>
      </div>

      <div className="req-toolbar">
        <div className="req-toolbar-title">
          <h2 className="section-title disp">{t('systems.reqSection')}</h2>
          <span className="count-badge mono">{linked.length}</span>
        </div>
        <div className="req-toolbar-actions">
          <button type="button" className="btn" onClick={() => setPickerOpen(true)}>
            {t('systems.linkRequirement')}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => setCreateOpen(true)}
          >
            {t('systems.newRequirement')}
          </button>
        </div>
      </div>

      <RequirementFilters value={filters} onChange={setFilters} t={t} />

      {linked.length === 0 ? (
        <div className="req-empty">{t('systems.noRequirements')}</div>
      ) : filtered.length === 0 ? (
        <div className="req-empty">{t('systems.noFiltered')}</div>
      ) : (
        <div className="req-list">
          {filtered.map((requirement) => (
            <RequirementCard
              key={requirement.id}
              requirement={requirement}
              system={system}
              active={system.activeRequirementId === requirement.id}
              references={systemsReferencing(config, requirement.id)}
              update={update}
              t={t}
              onOpenSystem={onOpenSystem}
            />
          ))}
        </div>
      )}

      {pickerOpen && (
        <RequirementPicker
          requirements={unlinked}
          onLink={(requirementId) => {
            update((cfg) => linkRequirement(cfg, system.id, requirementId));
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
          t={t}
        />
      )}

      {createOpen && (
        <RequirementFormModal
          config={config}
          system={system}
          update={update}
          t={t}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </section>
  );
}
