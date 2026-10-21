import { useState } from 'react';
import { quickCreateSystem } from '@/lib/ops';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';

function openOptions() {
  void browser.runtime.openOptionsPage();
}

export function QuickCreate({
  host,
  update,
  t,
}: {
  host: string;
  update: Update;
  t: T;
}) {
  const [name, setName] = useState('');
  return (
    <section className="quick">
      <div className="qc-title disp">{t('quick.title')}</div>
      <div className="qc-desc">
        <span className="qc-domain-label">{t('quick.descDomain')}</span> <b className="mono">{host}</b> {t('quick.desc')}
      </div>
      <input
        type="text"
        className="qc-name"
        value={name}
        placeholder={t('quick.namePlaceholder')}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        type="button"
        className="btn primary qc-create"
        onClick={() => update((cfg) => quickCreateSystem(cfg, name, host))}
      >
        {t('quick.create')}
      </button>
      <button type="button" className="link-btn" onClick={openOptions}>
        {t('quick.openOptions')}
      </button>
    </section>
  );
}
