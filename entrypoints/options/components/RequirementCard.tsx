import { requirementExpired } from '@/lib/requirements';
import {
  addPair,
  deletePair,
  unlinkRequirement,
  updatePair,
  updateRequirement,
} from '@/lib/ops';
import type { Requirement, SystemEntry } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';
import { HeaderPairRow } from './HeaderPairRow';

/**
 * 需求卡片（瀑布流双列）：
 * 上半部分左侧为名称/描述/引用系统，右侧为过期状态与操作；
 * 下半部分为 Header 键值表。
 */
export function RequirementCard({
  requirement,
  references,
  system,
  active = false,
  update,
  t,
  onOpenSystem,
  onRequestDelete,
}: {
  requirement: Requirement;
  references: SystemEntry[];
  system?: SystemEntry;
  active?: boolean;
  update: Update;
  t: T;
  onOpenSystem?: (systemId: string) => void;
  /** 需求管理页：打开删除确认弹窗 */
  onRequestDelete?: (requirement: Requirement) => void;
}) {
  const expired = requirementExpired(requirement);

  const patch = (value: Partial<Requirement>) =>
    update((cfg) => updateRequirement(cfg, requirement.id, (r) => ({ ...r, ...value })));

  const visibleRefs = references.slice(0, 4);

  return (
    <div
      className={`scheme-card requirement-card${active ? ' active' : ''}`}
      data-requirement-id={requirement.id}
    >
      <div className="req-card-top">
        <div className="req-card-main">
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
          <div className="req-refs-row">
            <span className="req-meta-label">{t('requirements.referencedBy')}</span>
            <div className="req-refs-text">
              {references.length === 0 ? (
                <span className="req-refs-none">{t('requirements.orphan')}</span>
              ) : (
                <>
                  {visibleRefs.map((s, index) => (
                    <span key={s.id}>
                      {index > 0 && (
                        <span className="req-ref-sep">{t('requirements.refSeparator')}</span>
                      )}
                      <button
                        type="button"
                        className="req-ref-link"
                        onClick={() => onOpenSystem?.(s.id)}
                      >
                        {s.name || t('settings.unnamedSystem')}
                      </button>
                    </span>
                  ))}
                  {references.length > 4 && (
                    <span className="req-ref-more">{t('requirements.etc')}</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="req-card-side">
          <div className="req-expire-row">
            {/* 使用中 / 已过期互斥：过期后实际已停止注入，只显示「已过期」 */}
            {expired ? (
              <span className="expired-badge mono">{t('requirement.expiredBadge')}</span>
            ) : active ? (
              <span className="active-badge mono">{t('requirement.activeBadge')}</span>
            ) : null}
            <input
              type="datetime-local"
              className="expire-input mono"
              value={requirement.expiresAt ?? ''}
              title={t('requirement.expiresTitle')}
              aria-label={t('requirement.expiresLabel')}
              onChange={(e) => patch({ expiresAt: e.target.value || null })}
            />
          </div>

          <div className="req-right-actions">
            {requirement.expiresAt && (
              <button
                type="button"
                className="link-btn"
                title={t('requirement.clearExpiresTitle')}
                onClick={() => patch({ expiresAt: null })}
              >
                {t('requirement.clearExpires')}
              </button>
            )}
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
                className="link-btn danger req-delete"
                title={t('requirements.deleteTitle')}
                onClick={() => onRequestDelete?.(requirement)}
              >
                {t('common.delete')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="pair-table">
        <div className="pair-head mono">
          <span>{t('requirement.keyLabel')}</span>
          <span>{t('requirement.valueLabel')}</span>
          <span />
        </div>
        {requirement.headers.map((pair) => {
          const otherKeys = requirement.headers
            .filter((h) => h.id !== pair.id)
            .map((h) => h.key.trim().toLowerCase())
            .filter(Boolean);
          return (
            <HeaderPairRow
              key={pair.id}
              pair={pair}
              otherKeys={otherKeys}
              onKeyChange={(key) =>
                update((cfg) => updatePair(cfg, requirement.id, pair.id, { key }))
              }
              onValueChange={(value) =>
                update((cfg) => updatePair(cfg, requirement.id, pair.id, { value }))
              }
              onDelete={() => update((cfg) => deletePair(cfg, requirement.id, pair.id))}
              t={t}
            />
          );
        })}
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
