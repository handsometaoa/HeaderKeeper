import { useEffect, useRef, useState } from 'react';
import { browser } from '#imports';
import { parseDomainInput } from '@/lib/domains';
import {
  addSystem,
  deleteSystem,
  normalizeConfig,
} from '@/lib/ops';
import { useLaneConfig } from '@/hooks/useLaneConfig';
import { useLangFromConfig } from '@/hooks/useI18n';
import { LangToggle } from '@/components/LangToggle';
import { pad2 } from '@/utils/format';
import { SchemeList } from './components/SchemeList';
import { SidebarSystem } from './components/SidebarSystem';

export default function App() {
  const { config, update } = useLaneConfig();
  const { lang, t, setLang } = useLangFromConfig(config, update);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDomains, setNewDomains] = useState('');
  const [addError, setAddError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 仅首次加载时自动选中第一个系统；之后删除选中的系统不再自动展开其他系统
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!config || initializedRef.current) return;
    initializedRef.current = true;
    if (config.systems.length > 0) setSelectedId(config.systems[0]!.id);
  }, [config]);

  if (!config) {
    return <div className="loading">{t('common.loading')}</div>;
  }

  // 无兜底：选中的系统被删除后保持收起状态
  const current = config.systems.find((s) => s.id === selectedId);

  const openAdd = () => {
    setNewName('');
    setNewDomains('');
    setAddError('');
    setAdding(true);
  };

  const createSystem = () => {
    const name = newName.trim();
    const domains = parseDomainInput(newDomains);
    if (!name) return setAddError(t('options.errNameRequired'));
    if (domains.length === 0) return setAddError(t('options.errDomainRequired'));
    if (config.systems.some((s) => s.name === name)) return setAddError(t('options.errDuplicate'));
    const result = addSystem(config, { name, domains });
    update(() => result);
    setSelectedId(result.newId);
    setAdding(false);
  };

  /** 删除系统；若删除的是当前选中的，则改为选中它的上一个（没有则选后一个） */
  const removeSystem = (systemId: string) => {
    const index = config.systems.findIndex((s) => s.id === systemId);
    if (index === -1) return;
    const wasSelected = current?.id === systemId;
    update((cfg) => deleteSystem(cfg, systemId));
    if (wasSelected) {
      const neighbor = config.systems[index - 1] ?? config.systems[index + 1];
      setSelectedId(neighbor?.id ?? null);
    }
  };

  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `header-injection-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importConfig = async (file: File) => {
    try {
      const imported = normalizeConfig(JSON.parse(await file.text()));
      if (window.confirm(t('options.importConfirm', { n: imported.systems.length }))) {
        update(() => imported);
        setSelectedId(null);
      }
    } catch {
      window.alert(t('options.importFailed'));
    }
  };

  return (
    <div className="page">
      <div className="shell">
        <aside className="sidebar">
          <div className="side-brand">
            <div className="brand-mark">⇥</div>
            <div>
              <div className="side-kicker mono">NETWORK TOOLKIT</div>
              <div className="side-brand-name disp">HeaderKeeper</div>
            </div>
          </div>

          <div className="side-label mono">
            <span>{t('options.sideLabel')}</span>
            <span>{pad2(config.systems.length)}</span>
          </div>

          <div className="sys-list">
            {config.systems.map((system, index) => (
              <SidebarSystem
                key={system.id}
                system={system}
                index={index}
                otherNames={config.systems
                  .filter((s) => s.id !== system.id)
                  .map((s) => s.name)}
                selected={current?.id === system.id}
                onSelect={() => setSelectedId(system.id)}
                onDelete={() => removeSystem(system.id)}
                update={update}
                t={t}
              />
            ))}
            {config.systems.length === 0 && <div className="side-hint">{t('options.sideHint')}</div>}
          </div>

          {adding ? (
            <div className="sys-edit add-form">
              <label className="edit-label mono">
                {t('options.sysName')}
                <input
                  type="text"
                  value={newName}
                  placeholder={t('options.sysNamePh')}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </label>
              <label className="edit-label mono">
                {t('options.domains')}
                <input
                  type="text"
                  className="mono"
                  value={newDomains}
                  placeholder={t('options.domainsPh')}
                  onChange={(e) => setNewDomains(e.target.value)}
                />
              </label>
              {addError && <div className="form-error">{addError}</div>}
              <div className="edit-row">
                <button type="button" className="btn primary" onClick={createSystem}>
                  {t('common.create')}
                </button>
                <button type="button" className="btn" onClick={() => setAdding(false)}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn add-sys" onClick={openAdd}>
              {t('options.addSystem')}
            </button>
          )}

          <div className="side-note">{t('options.sideNote')}</div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div className="title-block">
              <div className="kicker mono">NETWORK TOOLKIT / 01</div>
              <h1 className="disp">Let&apos;s switch lanes!</h1>
            </div>
            <div className="head-actions">
              <label className="engine-pill">
                <span className="engine-dot" />
                {t('options.engine')}
              </label>
              <label className="pill-toggle" title={t('options.global')}>
                {t('options.global')}
                <span className="switch mini">
                  <input
                    type="checkbox"
                    checked={config.globalEnabled}
                    onChange={(e) => update((cfg) => ({ ...cfg, globalEnabled: e.target.checked }))}
                  />
                  <span className="track" />
                </span>
              </label>
              <LangToggle lang={lang} onChange={setLang} title="Language / 语言" />
              <button type="button" className="btn" onClick={exportConfig}>
                {t('options.export')}
              </button>
              <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
                {t('options.import')}
              </button>
            </div>
          </header>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importConfig(file);
              e.target.value = '';
            }}
          />

          {!config.globalEnabled && <div className="banner">{t('options.bannerOff')}</div>}

          {current ? (
            <SchemeList key={current.id} system={current} update={update} t={t} />
          ) : config.systems.length > 0 ? (
            <div className="empty">{t('options.emptyNoSelection')}</div>
          ) : (
            <div className="empty">{t('options.emptyNoSystems')}</div>
          )}

          <footer className="page-foot mono">
            {t('options.footSave')} · {t('options.footVerify')} ·
            <button
              type="button"
              className="link-btn"
              onClick={() => void browser.tabs.create({ url: 'https://httpbin.org/headers' })}
            >
              {t('options.footVerifyOpen')}
            </button>
          </footer>
        </main>
      </div>
    </div>
  );
}
