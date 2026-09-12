import { useEffect, useState } from 'react';
import { schemeExpired } from '@/lib/schemes';
import {
  addPair,
  deletePair,
  deleteScheme,
  updatePair,
  updateScheme,
} from '@/lib/ops';
import type { HeaderPair, Scheme } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';
import { pad2 } from '@/utils/format';

export function SchemeCard({
  systemId,
  scheme,
  index,
  active,
  update,
  t,
}: {
  systemId: string;
  scheme: Scheme;
  index: number;
  active: boolean;
  update: Update;
  t: T;
}) {
  const expired = schemeExpired(scheme);
  // 两段式确认：第一次点击变为「确认删除」，再点执行；3 秒无操作自动还原
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  return (
    <div
      className={`scheme-card${active ? ' active' : ''}${expired ? ' expired' : ''}`}
      data-scheme-id={scheme.id}
    >
      <div className="scheme-head">
        <span className="scheme-index mono">{pad2(index + 1)}</span>
        <div className="scheme-title">
          <input
            type="text"
            className="scheme-name disp"
            value={scheme.name}
            placeholder={t('scheme.namePh')}
            onChange={(e) =>
              update((cfg) =>
                updateScheme(cfg, systemId, scheme.id, (sc) => ({ ...sc, name: e.target.value })),
              )
            }
          />
          <input
            type="text"
            className="scheme-desc"
            value={scheme.description}
            placeholder={t('scheme.descPh')}
            onChange={(e) =>
              update((cfg) =>
                updateScheme(cfg, systemId, scheme.id, (sc) => ({
                  ...sc,
                  description: e.target.value,
                })),
              )
            }
          />
        </div>
        {active && <span className="active-badge mono">ACTIVE</span>}
        <button
          type="button"
          className={`icon-btn scheme-delete${confirming ? ' confirming' : ''}`}
          title={confirming ? t('scheme.confirmAgain') : t('scheme.deleteTitle')}
          onClick={() => {
            if (confirming) {
              update((cfg) => deleteScheme(cfg, systemId, scheme.id));
            } else {
              setConfirming(true);
            }
          }}
        >
          {confirming ? '确认删除' : '✕'}
        </button>
      </div>

      <div className="scheme-meta">
        <span className="meta-label mono">{t('scheme.expiresLabel')}</span>
        <input
          type="datetime-local"
          className="expire-input mono"
          value={scheme.expiresAt ?? ''}
          title={t('scheme.expiresTitle')}
          onChange={(e) =>
            update((cfg) =>
              updateScheme(cfg, systemId, scheme.id, (sc) => ({
                ...sc,
                expiresAt: e.target.value || null,
              })),
            )
          }
        />
        {scheme.expiresAt && (
          <button
            type="button"
            className="link-btn"
            title={t('scheme.expiresClearTitle')}
            onClick={() =>
              update((cfg) =>
                updateScheme(cfg, systemId, scheme.id, (sc) => ({ ...sc, expiresAt: null })),
              )
            }
          >
            清除
          </button>
        )}
        {expired && <span className="expired-badge mono">{t('scheme.expiredBadge')}</span>}
      </div>

      <div className="pair-table">
        <div className="pair-head mono">
          <span>{t('scheme.keyLabel')}</span>
          <span>{t('scheme.valueLabel')}</span>
          <span />
        </div>
        {scheme.headers.map((pair: HeaderPair) => (
          <div className="pair-row" key={pair.id}>
            <input
              type="text"
              className="key-input"
              value={pair.key}
              placeholder={t('scheme.keyPh')}
              onChange={(e) =>
                update((cfg) =>
                  updatePair(cfg, systemId, scheme.id, pair.id, { key: e.target.value }),
                )
              }
            />
            <input
              type="text"
              value={pair.value}
              placeholder={t('scheme.valuePh')}
              onChange={(e) =>
                update((cfg) =>
                  updatePair(cfg, systemId, scheme.id, pair.id, { value: e.target.value }),
                )
              }
            />
            <button
              type="button"
              className="icon-btn"
              title={t('scheme.delHeaderTitle')}
              onClick={() => update((cfg) => deletePair(cfg, systemId, scheme.id, pair.id))}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="pair-add"
          onClick={() => update((cfg) => addPair(cfg, systemId, scheme.id))}
        >
          ＋ 添加 Header
        </button>
      </div>
    </div>
  );
}
