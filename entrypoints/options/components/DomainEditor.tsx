import { useState } from 'react';
import { parseDomainInput } from '@/lib/domains';
import type { T } from '@/lib/i18n';

/** 多域名编辑器：chips + 输入框，支持批量粘贴 */
export function DomainEditor({
  domains,
  onChange,
  t,
  invalid = false,
}: {
  domains: string[];
  onChange: (domains: string[]) => void;
  t: T;
  /** 外部校验（如未填写域名）时为输入框描红 */
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);

  const add = () => {
    const parsed = parseDomainInput(draft);
    if (parsed.length === 0) {
      setError(true);
      return;
    }
    onChange([...new Set([...domains, ...parsed])]);
    setDraft('');
    setError(false);
  };

  return (
    <div className="domain-editor">
      <div className="domain-chips">
        {domains.length === 0 && <span className="domain-empty">{t('domains.empty')}</span>}
        {domains.map((domain) => (
          <span className="domain-chip mono" key={domain}>
            {domain}
            <button
              type="button"
              className="domain-remove"
              title={t('domains.remove')}
              aria-label={t('domains.remove')}
              onClick={() => onChange(domains.filter((d) => d !== domain))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="domain-add">
        <input
          type="text"
          value={draft}
          className={error || invalid ? 'invalid' : ''}
          placeholder={t('domains.placeholder')}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn" onClick={add}>
          {t('domains.add')}
        </button>
      </div>
      {error && <div className="form-error">{t('domains.invalid')}</div>}
      <div className="domain-hint">{t('domains.hint')}</div>
    </div>
  );
}
