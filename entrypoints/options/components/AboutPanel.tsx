import { browser } from '#imports';
import { BrandMark } from '@/components/BrandMark';
import type { T } from '@/lib/i18n';

const REPO = 'https://github.com/handsometaoa/HeaderKeeper';

export function AboutPanel({ t }: { t: T }) {
  const version = browser.runtime.getManifest().version;

  return (
    <section className="about-page">
      <div className="panel-card about-hero">
        <BrandMark className="about-mark" />
        <h2 className="about-title disp">HeaderKeeper</h2>
        <p className="about-sub">{t('about.sub')}</p>
        <div className="about-meta mono">
          v{version} · {t('about.stack')}
        </div>
      </div>

      <div className="panel-card about-rows">
        <a className="about-row" href="https://github.com/handsometaoa" target="_blank" rel="noreferrer">
          <span className="about-row-label">{t('about.author')}</span>
          <span className="about-row-value">handsometaoa</span>
        </a>
        <a className="about-row" href="https://github.com/handsometaoa" target="_blank" rel="noreferrer">
          <span className="about-row-label">{t('about.github')}</span>
          <span className="about-row-value">@handsometaoa</span>
        </a>
        <a className="about-row" href={REPO} target="_blank" rel="noreferrer">
          <span className="about-row-label">{t('about.repo')}</span>
          <span className="about-row-value">HeaderKeeper</span>
        </a>
        <a className="about-row" href={`${REPO}/issues`} target="_blank" rel="noreferrer">
          <span className="about-row-label">{t('about.feedback')}</span>
          <span className="about-row-value">{t('about.openIssue')}</span>
        </a>
      </div>

      <div className="panel-card about-note-card">
        <div className="about-note">{t('about.note')}</div>
        <a className="btn primary" href={REPO} target="_blank" rel="noreferrer">
          {t('about.star')}
        </a>
      </div>
    </section>
  );
}
