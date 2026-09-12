import { useEffect, useState } from 'react';
import { browser } from '#imports';
import { refreshBadge } from '@/services/badge';
import { matchSystems } from '@/lib/domains';
import { findHeaderConflicts } from '@/lib/conflicts';
import { schemeExpired } from '@/lib/schemes';
import { quickCreateSystem, setActiveScheme, setSystemEnabled } from '@/lib/ops';
import { QuickCreate } from './components/QuickCreate';
import { SystemCard } from './components/SystemCard';
import { AboutCard } from './components/AboutCard';
import { LangToggle } from '@/components/LangToggle';
import { useLaneConfig } from '@/hooks/useLaneConfig';
import { useLangFromConfig } from '@/hooks/useI18n';

function openOptions() {
  void browser.runtime.openOptionsPage();
}

export default function App() {
  const { config, update } = useLaneConfig();
  const { lang, t, setLang } = useLangFromConfig(config, update);
  const [host, setHost] = useState<string | null>(null);
  const [hostResolved, setHostResolved] = useState(false);
  const [view, setView] = useState<'main' | 'about'>('main');

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
  const conflicts = host ? findHeaderConflicts(config.systems, host) : [];
  // 汇总当前域名下所有系统实际会注入的 Header（含来源系统，列表靠后者覆盖靠前）
  const injectingPairs = config.globalEnabled
    ? matched.flatMap((system) => {
        if (system.enabled === false) return [];
        const scheme = system.schemes.find((s) => s.id === system.activeSchemeId);
        if (!scheme || schemeExpired(scheme)) return [];
        const name = system.name || t('options.unnamed');
        return scheme.headers
          .filter((h) => h.key.trim() && h.value.trim())
          .map((h) => ({ id: `${system.id}:${h.id}`, key: h.key, value: h.value, system: name }));
      })
    : [];

  // 「关于」视图切换（在 JSX 外计算，避免 TS 收窄误报）；关于视图下按钮变为返回
  const toggleAbout = () => setView((v) => (v === 'about' ? 'main' : 'about'));
  const aboutLabel = view === 'about' ? t('popup.back') : t('popup.footerAbout');

  return (
    <div className="app">
      <section className="master">
        <div className="master-icon">⇥</div>
        <div className="master-text">
          <div className="master-label mono">{t('master.label')}</div>
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

      {view === 'about' ? (
        <AboutCard t={t} />
      ) : (
        <div className="body">
            {!hostResolved ? (
              <div className="page-hint mono">{t('popup.reading')}</div>
            ) : host === null ? (
              <div className="page-hint">{t('popup.nonWeb')}</div>
            ) : (
              <>
                <div className="host-bar">
                  <span className="host-label mono">{t('popup.hostLabel')}</span>
                  <span className="host-value mono">{host}</span>
                </div>
                {injectingPairs.length > 0 && (
                  <section className="inject-card">
                    <div className="inject-head">
                      <span className="inject-label mono">{t('popup.injectLabel')}</span>
                      <span className="inject-count mono">{injectingPairs.length}</span>
                    </div>
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
                )}
                {conflicts.length > 0 && (
                  <div className="conflict-card">
                    <div className="conflict-title">{t('popup.conflictTitle')}</div>
                    <div className="conflict-body">
                      {conflicts.map((conflict) => (
                        <div key={conflict.key.toLowerCase()}>
                          <b className="mono">{conflict.key}</b> {t('popup.conflictBy')}{' '}
                          <b>{conflict.systems.join('、')}</b> {t('popup.conflictSuffix')}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {matched.length === 0 ? (
                  <QuickCreate host={host} update={update} t={t} />
                ) : (
                  matched.map((system) => (
                    <SystemCard
                      key={system.id}
                      system={system}
                      globalEnabled={config.globalEnabled}
                      update={update}
                      t={t}
                    />
                  ))
                )}
              </>
            )}
          </div>
      )}

      <footer className="footer">
        <span className="mono">{t('popup.footerBrand')}</span>
        <div className="footer-links">
          <LangToggle lang={lang} onChange={setLang} title="Language / 语言" />
          <button type="button" className="link-btn" onClick={openOptions}>
            {t('popup.footerOptions')}
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={toggleAbout}
          >
            {aboutLabel}
          </button>
        </div>
      </footer>
    </div>
  );
}
