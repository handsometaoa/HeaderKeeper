import { useEffect, useRef, useState } from 'react';
import { browser } from '#imports';
import { BrandMark } from '@/components/BrandMark';
import { useLaneConfig } from '@/hooks/useLaneConfig';
import { useTheme } from '@/hooks/useTheme';
import { useLangFromConfig } from '@/hooks/useI18n';
import { pruneEmptyHeaderPairs } from '@/lib/ops';
import { AboutPanel } from './components/AboutPanel';
import { GeneralPanel } from './components/GeneralPanel';
import { RequirementsPanel } from './components/RequirementsPanel';
import { SettingsNav } from './components/SettingsNav';
import type { Section } from './components/SettingsNav';
import { SystemDetail } from './components/SystemDetail';
import { SystemsPanel } from './components/SystemsPanel';

export default function App() {
  const { config, update } = useLaneConfig();
  const { lang, t, setLang } = useLangFromConfig(config, update);
  useTheme(config);
  const [section, setSection] = useState<Section>('systems');
  const [detailSystemId, setDetailSystemId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; variant: 'warn' | 'success' } | null>(null);
  const prevGlobalRef = useRef<boolean | undefined>(undefined);
  const queryHandledRef = useRef(false);

  // 仅在全局注入从「开」切到「关」时弹一次 3 秒提示
  useEffect(() => {
    if (!config) return;
    const previous = prevGlobalRef.current;
    prevGlobalRef.current = config.globalEnabled;
    if (previous === true && !config.globalEnabled) {
      setToast({ text: t('settings.bannerOff'), variant: 'warn' });
    }
    if (config.globalEnabled) setToast(null);
  }, [config?.globalEnabled]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /** 供各面板弹出 3 秒顶部提示（导入成功等操作反馈） */
  const showToast = (text: string, variant: 'warn' | 'success') => setToast({ text, variant });

  // 从弹窗「编辑」进入时，用 ?system=<id> 直接定位到系统详情
  useEffect(() => {
    if (!config || queryHandledRef.current) return;
    queryHandledRef.current = true;
    const id = new URLSearchParams(location.search).get('system');
    if (id && config.systems.some((s) => s.id === id)) {
      setSection('systems');
      setDetailSystemId(id);
    }
  }, [config]);

  if (!config) {
    return <div className="loading">{t('common.loading')}</div>;
  }

  const version = browser.runtime.getManifest().version;
  const detail = config.systems.find((s) => s.id === detailSystemId) ?? null;
  const inDetail = section === 'systems' && detail !== null;

  // 离开当前编辑页面时，丢弃未写入的空 Key 行（例如重复 Key 尚未修正）
  const leaveDraftKey = () => {
    update((cfg) => pruneEmptyHeaderPairs(cfg));
  };

  const changeSection = (next: Section) => {
    leaveDraftKey();
    setSection(next);
    if (next === 'systems') setDetailSystemId(null);
  };

  const openSystem = (systemId: string) => {
    leaveDraftKey();
    setSection('systems');
    setDetailSystemId(systemId);
  };

  const backToSystemList = () => {
    leaveDraftKey();
    setDetailSystemId(null);
  };

  const title = inDetail
    ? t('settings.title.systemDetail')
    : section === 'general'
      ? t('settings.title.general')
      : section === 'requirements'
        ? t('settings.title.requirements')
        : section === 'about'
          ? t('settings.title.about')
          : t('settings.title.systems');

  const subtitle = inDetail
    ? detail.domains.join(' · ') || t('domains.empty')
    : section === 'general'
      ? t('settings.sub.general')
      : section === 'requirements'
        ? t('settings.sub.requirements', { n: config.requirements.length })
        : section === 'about'
          ? t('settings.sub.about', { version })
          : t('settings.sub.systems', { n: config.systems.length });

  return (
    <div className="page">
      <div className="shell">
        <aside className="nav">
          <div className="nav-brand">
            <BrandMark className="brand-mark" />
            <div className="nav-brand-name disp">HeaderKeeper</div>
          </div>
          <SettingsNav section={section} onChange={changeSection} t={t} />
          <div className="nav-foot">
            <div className="nav-foot-row">
              <span className="nav-foot-dot" />
              <span>{t('settings.localOnly')}</span>
            </div>
            <div className="nav-foot-version mono">v{version}</div>
          </div>
        </aside>

        <main className="content">
          <header className="content-head">
            <div className="title-block">
              <h1 className="disp">{title}</h1>
              <div className="subtitle">{subtitle}</div>
            </div>
            <div className="head-actions">
              <span className="engine-pill">
                <span className="engine-dot" />
                {t('settings.engine')}
              </span>
              <label className="pill-toggle" title={t('settings.global')}>
                {t('settings.global')}
                <span className="switch mini signal">
                  <input
                    type="checkbox"
                    checked={config.globalEnabled}
                    onChange={(e) =>
                      update((cfg) => ({ ...cfg, globalEnabled: e.target.checked }))
                    }
                  />
                  <span className="track" />
                </span>
              </label>
            </div>
          </header>

          {section === 'general' ? (
            <GeneralPanel
              config={config}
              update={update}
              lang={lang}
              setLang={setLang}
              t={t}
            />
          ) : section === 'systems' ? (
            detail ? (
              <SystemDetail
                config={config}
                system={detail}
                update={update}
                t={t}
                onBack={backToSystemList}
                onOpenSystem={openSystem}
              />
            ) : (
              <SystemsPanel
                config={config}
                update={update}
                t={t}
                onOpenSystem={openSystem}
              />
            )
          ) : section === 'requirements' ? (
            <RequirementsPanel
              config={config}
              update={update}
              t={t}
              onOpenSystem={openSystem}
              onToast={showToast}
            />
          ) : (
            <AboutPanel t={t} />
          )}

          <footer className="page-foot mono">
            {t('settings.footSave')} · {t('settings.footVerify')} ·
            <button
              type="button"
              className="link-btn"
              onClick={() =>
                void browser.tabs.create({ url: 'https://httpbin.org/headers' })
              }
            >
              {t('settings.footVerifyOpen')}
            </button>
          </footer>
        </main>
      </div>

      {toast && (
        <div className={`toast ${toast.variant}`} role="status">
          {toast.variant === 'success' ? (
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="8 12.5 11 15.5 16 9.5" />
            </svg>
          ) : (
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
          {toast.text}
        </div>
      )}
    </div>
  );
}
