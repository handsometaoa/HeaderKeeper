import { useEffect, useState } from 'react';
import { addScheme, addPair } from '@/lib/ops';
import type { SystemEntry } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';
import { pad2 } from '@/utils/format';
import { SchemeCard } from './SchemeCard';

/** 主区：当前系统的方案列表（新方案在顶部，倒序展示） */
export function SchemeList({ system, update, t }: { system: SystemEntry; update: Update; t: T }) {
  const [adding, setAdding] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [addError, setAddError] = useState('');

  const openAdd = () => {
    setNameDraft('');
    setDescDraft('');
    setAddError('');
    setAdding(true);
  };

  const createScheme = () => {
    const name = nameDraft.trim();
    if (!name) return setAddError(t('list.errNameRequired'));
    update((cfg) => addScheme(cfg, system.id, { name, description: descDraft.trim() }));
    setAdding(false);
  };

  // 倒序展示：最新创建的方案排在最上面
  const orderedSchemes = [...system.schemes].reverse();

  // 右侧目录栏：锚点是方案卡片，滚动时高亮视口中央的卡片
  const [activeTick, setActiveTick] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const cards = [...document.querySelectorAll('.scheme-card[data-scheme-id]')];
      if (cards.length === 0) return;
      const mid = window.innerHeight / 2;
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      cards.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(rect.top + rect.height / 2 - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      setActiveTick(best);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [system.schemes.length, adding]);

  return (
    <section className="detail-panel">
      <div className="schemes-head">
        <span className="kicker mono">{t('list.head')}</span>
        <span className="schemes-count mono">{pad2(system.schemes.length)}</span>
      </div>

      {/* 右侧目录栏：锚点为方案卡片，点击快速定位 */}
      {orderedSchemes.length > 0 && (
        <nav className="sys-rail" title="方案目录">
          {orderedSchemes.map((scheme, index) => (
            <button
              type="button"
              key={scheme.id}
              className={`sys-rail-tick${index === activeTick ? ' active' : ''}`}
              title={`${pad2(index + 1)} ${scheme.name || '未命名方案'}`}
              onClick={() =>
                document
                  .querySelector(`[data-scheme-id="${scheme.id}"]`)
                  ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
              }
            >
              <span className="tick-bar" />
            </button>
          ))}
        </nav>
      )}

      <div className="schemes">
        {adding ? (
          <div className="scheme-card add-form-scheme">
            <div className="scheme-head">
              <span className="scheme-index mono">＋</span>
              <div className="scheme-title">
                <input
                  type="text"
                  className="scheme-name disp"
                  value={nameDraft}
                  autoFocus
                  placeholder={t('list.namePh')}
                  onChange={(e) => setNameDraft(e.target.value)}
                />
                <input
                  type="text"
                  className="scheme-desc"
                  value={descDraft}
                  placeholder={t('list.descPh')}
                  onChange={(e) => setDescDraft(e.target.value)}
                />
              </div>
            </div>
            {addError && <div className="form-error scheme-add-error">{addError}</div>}
            <div className="edit-row scheme-form-actions">
              <button type="button" className="btn primary" onClick={createScheme}>
                创建方案
              </button>
              <button type="button" className="btn" onClick={() => setAdding(false)}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn dashed add-scheme" onClick={openAdd}>
            {t('list.add', { name: system.name || t('options.unnamed') })}
          </button>
        )}

        {orderedSchemes.map((scheme, index) => (
          <SchemeCard
            key={scheme.id}
            systemId={system.id}
            scheme={scheme}
            index={orderedSchemes.length - 1 - index}
            active={system.activeSchemeId === scheme.id}
            update={update}
            t={t}
          />
        ))}
        {system.schemes.length === 0 && !adding && (
          <div className="hint">{t('list.none')}</div>
        )}
      </div>
    </section>
  );
}
