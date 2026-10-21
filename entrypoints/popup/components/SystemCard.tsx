import { browser } from '#imports';
import { requirementExpired } from '@/lib/requirements';
import { setActiveRequirement, setSystemEnabled } from '@/lib/ops';
import type { Requirement, SystemEntry } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';

/** 打开配置页并定位到该系统详情 */
function openSystemOptions(systemId: string) {
  const url = `${browser.runtime.getURL('/options.html')}?system=${encodeURIComponent(systemId)}`;
  void browser.tabs.create({ url });
}

export function SystemCard({
  system,
  requirements,
  globalEnabled,
  update,
  t,
}: {
  system: SystemEntry;
  requirements: Requirement[];
  globalEnabled: boolean;
  update: Update;
  t: T;
}) {
  const enabled = system.enabled !== false;
  // 过期的需求不在主界面展示、也不注入
  const visibleRequirements = requirements.filter((r) => !requirementExpired(r));
  const active = requirements.find((r) => r.id === system.activeRequirementId);
  const injecting = enabled && !!active && !requirementExpired(active);

  return (
    <section className="system-card">
      <div className="system-head">
        <span className={`sys-dot${injecting ? ' on' : ''}`} />
        <span className="sys-name disp">{system.name || t('settings.unnamedSystem')}</span>
        <button
          type="button"
          className="edit-link"
          title={t('card.editTitle')}
          onClick={() => openSystemOptions(system.id)}
        >
          {t('card.edit')}
        </button>
        <span className="sys-domains mono" title={system.domains.join(' · ')}>
          {system.domains[0] ?? t('domains.empty')}
          {system.domains.length > 1 ? ` +${system.domains.length - 1}` : ''}
        </span>
        <label
          className="switch mini"
          title={enabled ? t('card.switchOffTitle') : t('card.switchOnTitle')}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => update((cfg) => setSystemEnabled(cfg, system.id, e.target.checked))}
          />
          <span className="track" />
        </label>
      </div>
      <div className={globalEnabled && enabled ? 'scheme-list' : 'scheme-list dim'}>
        {requirements.length === 0 && <div className="scheme-empty">{t('card.none')}</div>}
        {requirements.length > 0 && visibleRequirements.length === 0 && (
          <div className="scheme-empty">{t('card.allExpired')}</div>
        )}
        {visibleRequirements.map((requirement, index) => {
          const isActive = system.activeRequirementId === requirement.id;
          return (
            <button
              type="button"
              key={requirement.id}
              className={`scheme-row${isActive ? ' active' : ''}`}
              title={isActive ? t('card.rowOnTitle') : t('card.rowOffTitle')}
              onClick={() =>
                update((cfg) =>
                  setActiveRequirement(cfg, system.id, isActive ? null : requirement.id),
                )
              }
            >
              <span className="scheme-index mono">{String(index + 1).padStart(2, '0')}</span>
              <span className="scheme-main">
                <span className="scheme-name disp">
                  {requirement.name || t('requirement.unnamed')}
                </span>
                {requirement.description.trim() && (
                  <span className="scheme-desc">{requirement.description}</span>
                )}
              </span>
              <span className="scheme-state mono">
                {isActive ? t('card.stateOn') : t('card.stateOff')}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
