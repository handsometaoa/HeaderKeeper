import { browser } from '#imports';
import type { T } from '@/lib/i18n';

export function AboutCard({ t }: { t: T }) {
  const version = browser.runtime.getManifest().version;
  const repo = 'https://github.com/handsometaoa/HeaderKeeper';

  return (
    <div className="about">
      <div className="about-mark">⇥</div>
      <h1 className="about-title disp">HeaderKeeper</h1>
      <p className="about-sub">{t('author.sub')}</p>

      <div className="about-rows">
        <div className="row">
          <span className="row-label mono">{t('author.author')}</span>
          <span className="row-value">
            <a href="https://github.com/handsometaoa" target="_blank" rel="noreferrer">
              handsometaoa
            </a>
          </span>
        </div>
        <div className="row">
          <span className="row-label mono">{t('author.github')}</span>
          <span className="row-value">
            <a href="https://github.com/handsometaoa" target="_blank" rel="noreferrer">
              @handsometaoa
            </a>
          </span>
        </div>
        <div className="row">
          <span className="row-label mono">{t('author.repo')}</span>
          <span className="row-value">
            <a href={repo} target="_blank" rel="noreferrer">
              HeaderKeeper
            </a>
          </span>
        </div>
        <div className="row">
          <span className="row-label mono">{t('author.feedback')}</span>
          <span className="row-value">
            <a href={`${repo}/issues`} target="_blank" rel="noreferrer">
              {t('author.openIssue')}
            </a>
          </span>
        </div>
      </div>

      <div className="about-meta mono">
        v{version} · WXT + React · Manifest V3
      </div>

      <a className="btn primary star" href={repo} target="_blank" rel="noreferrer">
        {t('author.star')}
      </a>
    </div>
  );
}
