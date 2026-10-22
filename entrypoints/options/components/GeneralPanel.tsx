import { useRef } from 'react';
import { LangToggle } from '@/components/LangToggle';
import { parseImportedConfig } from '@/lib/ops';
import type { LaneConfig } from '@/lib/types';
import type { Update } from '@/hooks/useLaneConfig';
import type { Language, T } from '@/lib/i18n';

export function GeneralPanel({
  config,
  update,
  lang,
  setLang,
  t,
}: {
  config: LaneConfig;
  update: Update;
  lang: Language;
  setLang: (lang: Language) => void;
  t: T;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `header-keeper-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importConfig = async (file: File) => {
    try {
      const parsed = parseImportedConfig(JSON.parse(await file.text()));
      if (!parsed) {
        window.alert(t('settings.importLegacy'));
        return;
      }
      if (window.confirm(t('settings.importConfirm', { n: parsed.systems.length }))) {
        update(() => parsed);
      }
    } catch {
      window.alert(t('settings.importFailed'));
    }
  };

  return (
    <section className="general-page">
      <div className="panel-card general-row">
        <div className="general-row-main">
          <div className="panel-label">{t('general.language')}</div>
          <div className="panel-desc">{t('general.languageDesc')}</div>
        </div>
        <LangToggle lang={lang} onChange={setLang} title="Language / 语言" />
      </div>

      <div className="panel-card general-row">
        <div className="general-row-main">
          <div className="panel-label">{t('general.data')}</div>
          <div className="panel-desc">{t('general.dataDesc')}</div>
        </div>
        <div className="general-actions">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            {t('settings.import')}
          </button>
          <button type="button" className="btn" onClick={exportConfig}>
            {t('settings.export')}
          </button>
        </div>
      </div>

      <div className="panel-card general-block">
        <div className="panel-label">{t('general.storage')}</div>
        <div className="panel-desc">{t('general.storageDesc')}</div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importConfig(file);
          e.target.value = '';
        }}
      />
    </section>
  );
}
