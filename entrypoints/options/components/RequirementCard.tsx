import { useEffect, useState } from 'react';
import { requirementExpired } from '@/lib/requirements';
import {
  addPair,
  deletePair,
  deleteRequirement,
  unlinkRequirement,
  updatePair,
  updateRequirement,
} from '@/lib/ops';
import type { Requirement, SystemEntry } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';

/**
 * 共享需求卡片：
 * - 传 system 时用于系统详情（提供「移出本系统」）
 * - 不传 system 时用于需求管理（提供全局删除）
 * 引用系统与过期时间放在名称右侧，卡片主体只保留 Header 键值。
 */
export function RequirementCard({
  requirement,
  references,
  system,
  active = false,
  update,
  t,
  onOpenSystem,
}: {
  requirement: Requirement;
  references: SystemEntry[];
  system?: SystemEntry;
  active?: boolean;
  update: Update;
  t: T;
  onOpenSystem?: (systemId: string) => void;
}) {
  const expired = requirementExpired(requirement);
  // 两段式删除：第一次点击显示警告与确认文案，再点执行；4 秒后自动还原
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  const patch = (value: Partial<Requirement>) =>
    update((cfg) => updateRequirement(cfg, requirement.id, (r) => ({ ...r, ...value })));

  return (
    <div
      className={`scheme-card requirement-card${active ? ' active' : ''}`}
      data-requirement-id={requirement.id}
    >
      <div className="scheme-head requirement-head">
        <div className="scheme-title">
          <input
            type="text"
            className="scheme-name disp"
            value={requirement.name}
            placeholder={t('requirement.namePh')}
            onChange={(e) => patch({ name: e.target.value })}
          />
          <input
            type="text"
            className="scheme-desc"
            value={requirement.description}
            placeholder={t('requirement.descPh')}
            onChange={(e) => patch({ description: e.target.value })}
          />
        </div>

        <div className="req-inline">
          <div className="req-inline-group req-inline-refs">
            <span className="req-inline-label">{t('requirements.referencedBy')}</span>
            {references.length === 0 ? (
              <span className="req-refs-none">{t('requirements.unreferenced')}</span>
            ) : (
              references.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="req-ref-chip"
                  onClick={() => onOpenSystem?.(s.id)}
                >
                  {s.name || t('settings.unnamedSystem')}
                </button>
              ))
            )}
            {references.length > 1 && (
              <span className="shared-badge mono">
                {t('systems.shared', { n: references.length })}
              </span>
            )}
          </div>

          <div className="req-inline-group req-inline-expiry">
            <span className="req-inline-label">{t('requirement.expiresLabel')}</span>
            <input
              type="datetime-local"
              className="expire-input mono"
              value={requirement.expiresAt ?? ''}
              title={t('requirement.expiresTitle')}
              onChange={(e) => patch({ expiresAt: e.target.value || null })}
            />
            {requirement.expiresAt && (
              <button
                type="button"
                className="link-btn"
                onClick={() => patch({ expiresAt: null })}
              >
                {t('common.clear')}
              </button>
            )}
            {expired && (
              <span className="expired-badge mono">{t('requirement.expiredBadge')}</span>
            )}
          </div>
        </div>

        <div className="req-head-actions">
          {active && <span className="active-badge mono">{t('requirement.activeBadge')}</span>}
          {system ? (
            <button
              type="button"
              className="link-btn req-remove"
              title={t('systems.removeTitle')}
              onClick={() => update((cfg) => unlinkRequirement(cfg, system.id, requirement.id))}
            >
              {t('systems.remove')}
            </button>
          ) : (
            <button
              type="button"
              className={`link-btn danger req-delete${confirming ? ' confirming' : ''}`}
              title={confirming ? t('common.confirmAgain') : t('requirements.deleteTitle')}
              onClick={() => {
                if (confirming) update((cfg) => deleteRequirement(cfg, requirement.id));
                else setConfirming(true);
              }}
            >
              {confirming ? t('requirements.deleteConfirm') : t('common.delete')}
            </button>
          )}
        </div>
      </div>

      {confirming && (
        <div className="req-delete-warning">
          {references.length > 0
            ? t('requirements.deleteWarning', { n: references.length })
            : t('requirements.deleteWarningNone')}
        </div>
      )}

      <div className="pair-table">
        <div className="pair-head mono">
          <span>{t('requirement.keyLabel')}</span>
          <span>{t('requirement.valueLabel')}</span>
          <span />
        </div>
        {requirement.headers.map((pair) => (
          <div className="pair-row" key={pair.id}>
            <input
              type="text"
              className="key-input"
              value={pair.key}
              placeholder={t('requirement.keyPh')}
              onChange={(e) =>
                update((cfg) =>
                  updatePair(cfg, requirement.id, pair.id, { key: e.target.value }),
                )
              }
            />
            <input
              type="text"
              value={pair.value}
              placeholder={t('requirement.valuePh')}
              onChange={(e) =>
                update((cfg) =>
                  updatePair(cfg, requirement.id, pair.id, { value: e.target.value }),
                )
              }
            />
            <button
              type="button"
              className="icon-btn"
              title={t('requirement.delHeaderTitle')}
              onClick={() => update((cfg) => deletePair(cfg, requirement.id, pair.id))}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="pair-add"
          onClick={() => update((cfg) => addPair(cfg, requirement.id))}
        >
          {t('requirement.addHeader')}
        </button>
      </div>
    </div>
  );
}
