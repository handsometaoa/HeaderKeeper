import { browser } from '#imports';
import { schemeExpired } from '@/lib/schemes';
import { setActiveScheme, setSystemEnabled } from '@/lib/ops';
import type { SystemEntry } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';

function openOptions() {
  void browser.runtime.openOptionsPage();
}

export function SystemCard({
  system,
  globalEnabled,
  update,
  t,
}: {
  system: SystemEntry;
  globalEnabled: boolean;
  update: Update;
  t: T;
}) {
  const enabled = system.enabled !== false;
  // 过期的方案不在主界面展示、也不注入
  const visibleSchemes = system.schemes.filter((s) => !schemeExpired(s));
  const activeScheme = system.schemes.find((s) => s.id === system.activeSchemeId);
  const injecting = enabled && !!activeScheme && !schemeExpired(activeScheme);
  return (
    <section className="system-card">
      <div className="system-head">
        <span className={`sys-dot${injecting ? ' on' : ''}`} />
        <span className="sys-name disp">{system.name || t('options.unnamed')}</span>
        <span className="sys-domains mono">{system.domains.join(' · ')}</span>
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
      <div
        className={
          globalEnabled && enabled ? 'scheme-list' : 'scheme-list dim'
        }
      >
        {system.schemes.length === 0 && (
          <div className="scheme-empty">{t('card.none')}</div>
        )}
        {system.schemes.length > 0 && visibleSchemes.length === 0 && (
          <div className="scheme-empty">{t('card.allExpired')}</div>
        )}
        {visibleSchemes.map((scheme, index) => {
          const active = system.activeSchemeId === scheme.id;
          return (
            <button
              type="button"
              key={scheme.id}
              className={`scheme-row${active ? ' active' : ''}`}
              title={active ? t('card.rowOnTitle') : t('card.rowOffTitle')}
              onClick={() =>
                update((cfg) => setActiveScheme(cfg, system.id, active ? null : scheme.id))
              }
            >
              <span className="scheme-index mono">{String(index + 1).padStart(2, '0')}</span>
              <span className="scheme-main">
                <span className="scheme-name disp">{scheme.name || t('options.unnamed')}</span>
                {scheme.description.trim() && (
                  <span className="scheme-desc">{scheme.description}</span>
                )}
              </span>
              <span className="scheme-state mono">{active ? 'ACTIVE' : t('card.stateOff')}</span>
            </button>
          );
        })}
      </div>
      <div className="system-foot">
        <button type="button" className="link-btn" onClick={openOptions}>
          {t('card.edit')}
        </button>
      </div>
    </section>
  );
}
