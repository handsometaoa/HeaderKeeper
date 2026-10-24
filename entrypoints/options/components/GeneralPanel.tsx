import { useRef } from 'react';
import { LangToggle } from '@/components/LangToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { parseImportedConfig, normalizeTheme } from '@/lib/ops';
import { loadParserCode, saveParserCode } from '@/services/parserStore';
import type { LaneConfig, ThemeSetting } from '@/lib/types';
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

  const exportConfig = async () => {
    // 解析代码随配置一起导出，换设备/分享时自定义解析逻辑不丢失
    const parserCode = await loadParserCode();
    const payload = { ...config, parserCode };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `header-keeper-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importConfig = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const parserCode =
        raw &&
        typeof raw === 'object' &&
        typeof (raw as { parserCode?: unknown }).parserCode === 'string'
          ? (raw as { parserCode: string }).parserCode
          : null;
      const parsed = parseImportedConfig(raw);
      if (!parsed) {
        window.alert(t('settings.importLegacy'));
        return;
      }
      if (window.confirm(t('settings.importConfirm', { n: parsed.systems.length }))) {
        if (parserCode !== null) await saveParserCode(parserCode);
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
          <div className="panel-label">{t('theme.label')}</div>
          <div className="panel-desc">{t('theme.desc')}</div>
        </div>
        <ThemeToggle
          value={normalizeTheme(config.theme)}
          onChange={(theme: ThemeSetting) => update((cfg) => ({ ...cfg, theme }))}
          t={t}
        />
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
          <button type="button" className="btn" onClick={() => void exportConfig()}>
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
