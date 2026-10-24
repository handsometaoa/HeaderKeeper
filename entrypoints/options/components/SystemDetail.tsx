import { useState } from 'react';
import { linkRequirement } from '@/lib/ops';
import {
  emptyRequirementFilter,
  filterRequirements,
  requirementExpired,
  sortRequirementsDesc,
  systemRequirements,
  systemsReferencing,
} from '@/lib/requirements';
import type { LaneConfig, SystemEntry } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';
import { RequirementCard } from './RequirementCard';
import { RequirementFilters } from './RequirementFilters';
import { RequirementFormModal } from './RequirementFormModal';
import { RequirementPicker } from './RequirementPicker';

/** 系统详情：只读系统摘要 + 该系统关联需求的筛选、编辑与关联 */
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
  const [createOpen, setCreateOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filters, setFilters] = useState(emptyRequirementFilter);

  const linked = systemRequirements(config, system);
  const filtered = filterRequirements(sortRequirementsDesc(linked), filters);
  // 关联候选：未关联到本系统且未过期的需求
  const unlinked = config.requirements.filter(
    (requirement) =>
      !system.requirementIds.includes(requirement.id) &&
      !requirementExpired(requirement),
  );

  return (
    <section className="system-detail">
      <div className="system-summary-bar">
        <button type="button" className="btn system-summary-back" onClick={onBack}>
          {t('systems.back')}
        </button>
        <span className="system-summary-divider" aria-hidden="true" />
        <div className="system-summary-main">
          <span
            className={`sys-dot${
              system.enabled !== false && system.activeRequirementId ? ' on' : ''
            }`}
          />
          <span className="system-summary-name disp">
            {system.name || t('settings.unnamedSystem')}
          </span>
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
