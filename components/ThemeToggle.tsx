import type { ThemeSetting } from '@/lib/types';
import type { T } from '@/lib/i18n';

/** 主题切换：[浅色 | 深色 | 跟随系统] 分段控件，样式与语言切换一致 */
export function ThemeToggle({
  value,
  onChange,
  t,
}: {
  value: ThemeSetting;
  onChange: (theme: ThemeSetting) => void;
  t: T;
}) {
  const options: { value: ThemeSetting; label: string }[] = [
    { value: 'light', label: t('theme.light') },
    { value: 'dark', label: t('theme.dark') },
    { value: 'system', label: t('theme.system') },
  ];
  return (
    <div className="lang-toggle" role="group" aria-label={t('theme.label')} title={t('theme.label')}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'on' : ''}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
