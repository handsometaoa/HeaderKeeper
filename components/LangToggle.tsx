import type { Language } from '@/lib/i18n';

/** 语言切换：[中文 | EN] 分段控件 */
export function LangToggle({
  lang,
  onChange,
  title,
}: {
  lang: Language;
  onChange: (lang: Language) => void;
  title?: string;
}) {
  return (
    <div className="lang-toggle" role="group" aria-label="Language / 语言" title={title}>
      <button
        type="button"
        className={lang === 'zh' ? 'on' : ''}
        onClick={() => onChange('zh')}
      >
        中文
      </button>
      <button
        type="button"
        className={lang === 'en' ? 'on' : ''}
        onClick={() => onChange('en')}
      >
        EN
      </button>
    </div>
  );
}
