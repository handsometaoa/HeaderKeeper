import { useEffect, useState } from 'react';
import { browser } from '#imports';
import { refreshBadge } from '@/services/badge';
import { matchSystems } from '@/lib/domains';
import { findHeaderConflicts } from '@/lib/conflicts';
import { activeInjectableRequirement, systemRequirements } from '@/lib/requirements';
import { QuickCreate } from './components/QuickCreate';
import { SystemCard } from './components/SystemCard';
import { useLaneConfig } from '@/hooks/useLaneConfig';
import { useLangFromConfig } from '@/hooks/useI18n';

function openOptions() {
  void browser.runtime.openOptionsPage();
}

const POPUP_TAB_KEY = 'header-keeper.popupTab';
type PopupTab = 'inject' | 'systems';

/** 默认「当前注入」；读取上一次选择的 Tab */
function readStoredTab(): PopupTab {
  try {
    return localStorage.getItem(POPUP_TAB_KEY) === 'systems' ? 'systems' : 'inject';
  } catch {
    return 'inject';
  }
}

export default function App() {
  const { config, update } = useLaneConfig();
  const { t } = useLangFromConfig(config, update);
  const [host, setHost] = useState<string | null>(null);
  const [hostResolved, setHostResolved] = useState(false);
  // 两个分区互斥展示：命中系统多 / 注入 Header 多时避免纵向堆叠
  const [tab, setTab] = useState<PopupTab>(readStoredTab);

  useEffect(() => {
    try {
      localStorage.setItem(POPUP_TAB_KEY, tab);
    } catch {
      // localStorage 不可用时仅保留内存状态
    }
  }, [tab]);

  useEffect(() => {
    // 打开弹窗时按当前页面重算角标：
    // SPA 站内导航（如 github.com）不会触发 tabs.onUpdated，角标可能残留旧值
    void refreshBadge();
  }, []);

  useEffect(() => {
    // __host 查询参数供自动化测试注入假想的当前域名
    const fromQuery = new URLSearchParams(location.search).get('__host');
    if (fromQuery) {
      setHost(fromQuery);
      setHostResolved(true);
      return;
    }
    void (async () => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        const url = tab?.url ? new URL(tab.url) : null;
        setHost(url && /^https?:$/.test(url.protocol) ? url.hostname : null);
      } catch {
        setHost(null);
      }
      setHostResolved(true);
    })();
  }, []);

  if (!config) {
    return <div className="loading">{t('common.loading')}</div>;
  }

  const matched = host ? matchSystems(config.systems, host) : [];
  // 多个系统同时注入同一 Header Key 时提示可能冲突
  const conflicts = host ? findHeaderConflicts(config, host) : [];
  const firstConflict = conflicts[0];
  // 汇总当前域名下所有系统实际会注入的 Header（含来源系统，列表靠后者覆盖靠前）
  const injectingPairs = config.globalEnabled
    ? matched.flatMap((system) => {
        if (system.enabled === false) return [];
        const requirement = activeInjectableRequirement(config, system);
        if (!requirement) return [];
        const name = system.name || t('settings.unnamedSystem');
        return requirement.headers
          .filter((h) => h.key.trim() && h.value.trim())
          .map((h) => ({ id: `${system.id}:${h.id}`, key: h.key, value: h.value, system: name }));
      })
    : [];

  return (
    <div className="app">
      <header className="pop-head">
        <div className="pop-brand">
          <span className="pop-mark">⇥</span>
          <span className="pop-name disp">HeaderKeeper</span>
        </div>
        <button
          type="button"
          className="icon-btn settings"
          title={t('popup.settings')}
          aria-label={t('popup.settings')}
          onClick={openOptions}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>

      <section className={`master${config.globalEnabled ? '' : ' off'}`}>
        <div className="master-text">
          <div className="master-title disp">
            {config.globalEnabled ? t('master.on') : t('master.off')}
          </div>
          <div className="master-sub">
            {config.globalEnabled ? t('master.subOn') : t('master.subOff')}
          </div>
        </div>
        <label
          className="switch"
          title={config.globalEnabled ? t('master.toggleOnTitle') : t('master.toggleOffTitle')}
        >
          <input
            type="checkbox"
            checked={config.globalEnabled}
            onChange={(e) => update((cfg) => ({ ...cfg, globalEnabled: e.target.checked }))}
          />
          <span className="track" />
        </label>
      </section>

      <div className="body">
        {!hostResolved ? (
          <div className="page-hint mono">{t('popup.reading')}</div>
        ) : host === null ? (
          <div className="page-hint">{t('popup.nonWeb')}</div>
        ) : (
          <>
            <div className="host-row">
              <span className="host-value mono" title={host}>
                {host}
              </span>
              {firstConflict && (
                <span
                  className="conflict-inline"
                  title={[
                    t('popup.conflictTitle'),
                    ...conflicts.map(
                      (conflict) =>
                        `${conflict.key} ${t('popup.conflictBy')} ${conflict.systems.join('、')} ${t('popup.conflictSuffix')}`,
                    ),
                  ].join('\n')}
                >
                  <span className="conflict-inline-icon" aria-hidden="true">
                    !
                  </span>
                  <span className="conflict-inline-key mono">{firstConflict.key}</span>
                  <span className="conflict-inline-text">
                    {t('popup.conflictInline', {
                      systems: firstConflict.systems.join('、'),
                    })}
                  </span>
                  {conflicts.length > 1 && (
                    <span className="conflict-inline-more">+{conflicts.length - 1}</span>
                  )}
                </span>
              )}
            </div>
            {matched.length === 0 ? (
              <QuickCreate host={host} update={update} t={t} />
            ) : (
              <>
                <div className="tabs-sticky">
                  <div
                    className="tabs"
                    role="tablist"
                    aria-label={t('popup.tabsLabel')}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowLeft') setTab('inject');
                      if (e.key === 'ArrowRight') setTab('systems');
                    }}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === 'inject'}
                      className={`tab${tab === 'inject' ? ' active' : ''}`}
                      onClick={() => setTab('inject')}
                    >
                      {t('popup.injectTab', { n: injectingPairs.length })}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === 'systems'}
                      className={`tab${tab === 'systems' ? ' active' : ''}`}
                      onClick={() => setTab('systems')}
                    >
                      {t('popup.systems', { n: matched.length })}
                    </button>
                  </div>
                </div>

                {tab === 'inject' ? (
                  injectingPairs.length > 0 ? (
                    <section className="inject-card">
                      <div className="inject-pairs">
                        {injectingPairs.map((pair) => (
                          <div className="inject-pair mono" key={pair.id}>
                            <span className="pair-k">{pair.key}</span>
                            <span className="pair-sep">=</span>
                            <span className="pair-v">{pair.value}</span>
                            <span className="pair-sys">{pair.system}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : (
                    <div className="inject-empty">{t('popup.injectEmpty')}</div>
                  )
                ) : (
                  matched.map((system) => (
                    <SystemCard
                      key={system.id}
                      system={system}
                      requirements={systemRequirements(config, system)}
                      globalEnabled={config.globalEnabled}
                      update={update}
                      t={t}
                    />
                  ))
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
