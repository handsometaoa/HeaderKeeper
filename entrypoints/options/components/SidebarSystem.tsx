import { useEffect, useState } from 'react';
import { parseDomainInput } from '@/lib/domains';
import { deleteSystem, setSystemEnabled, updateSystem } from '@/lib/ops';
import type { SystemEntry } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';
import { pad2 } from '@/utils/format';

/** 侧栏系统项：选中后在项内展开详情（MATCH / 编辑系统 / 删除系统） */
export function SidebarSystem({
  system,
  index,
  otherNames,
  selected,
  onSelect,
  onDelete,
  update,
  t,
}: {
  system: SystemEntry;
  index: number;
  otherNames: string[];
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  update: Update;
  t: T;
}) {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(system.name);
  const [domainsDraft, setDomainsDraft] = useState(system.domains.join(', '));
  const [editError, setEditError] = useState('');
  // 两段式确认：第一次点击变为「确认删除」，再点执行；3 秒无操作自动还原
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  const startEdit = () => {
    setNameDraft(system.name);
    setDomainsDraft(system.domains.join(', '));
    setEditError('');
    setEditing(true);
  };

  const save = () => {
    const name = nameDraft.trim();
    const domains = parseDomainInput(domainsDraft);
    if (!name) return setEditError(t('sys.errNameRequired'));
    if (domains.length === 0) return setEditError(t('sys.errDomainRequired'));
    if (otherNames.includes(name)) return setEditError(t('sys.errDuplicate'));
    update((cfg) =>
      updateSystem(cfg, system.id, (s) => ({
        ...s,
        name,
        domains,
      })),
    );
    setEditing(false);
  };

  return (
    <div className={`sys-item-wrap${selected ? ' selected' : ''}`} data-sys-id={system.id}>
      <div
        className="sys-item"
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onSelect();
        }}
      >
        <span
          className={`sys-dot${system.enabled !== false && system.activeSchemeId ? ' on' : ''}`}
        />
        <span className="sys-item-main">
          <span className="sys-item-name">{system.name || t('options.unnamed')}</span>
          <span className="sys-item-domains mono">
            {system.domains.join(' · ') || '未设置域名'}
          </span>
        </span>
        <span className="sys-item-idx mono">{pad2(index + 1)}</span>
        <label
          className="switch mini sys-switch"
          title={system.enabled !== false ? t('sys.switchOffTitle') : t('sys.switchOnTitle')}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={system.enabled !== false}
            onChange={(e) => update((cfg) => setSystemEnabled(cfg, system.id, e.target.checked))}
          />
          <span className="track" />
        </label>
      </div>

      {selected && (
        <div className="sys-expand">
          {editing ? (
            <div className="sys-edit">
              <label className="edit-label mono">
                {t('sys.nameLabel')}
                <input
                  type="text"
                  value={nameDraft}
                  placeholder={t('sys.namePh')}
                  onChange={(e) => setNameDraft(e.target.value)}
                />
              </label>
              <label className="edit-label mono">
                {t('sys.domainsLabel')}
                <input
                  type="text"
                  className="mono"
                  value={domainsDraft}
                  placeholder="admin.acme.cn, *.insights.acme.cn"
                  onChange={(e) => setDomainsDraft(e.target.value)}
                />
              </label>
              {editError && <div className="form-error">{editError}</div>}
              <div className="edit-row">
                <button type="button" className="btn primary" onClick={save}>
                  保存
                </button>
                <button type="button" className="btn" onClick={() => setEditing(false)}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="sys-expand-row mono">
                <span>{t('sys.match')}</span>
                <span className="sys-expand-match">
                  {system.domains.join(' · ') || '未设置域名'}
                </span>
              </div>
              <div className="sys-expand-row">
                <button type="button" className="btn on-dark" onClick={startEdit}>
                  编辑系统
                </button>
                <button
                  type="button"
                  className={`btn sys-delete${confirming ? ' confirming' : ''}`}
                  title={confirming ? t('sys.confirmAgain') : t('sys.deleteTitle')}
                  onClick={() => {
                    if (confirming) {
                      onDelete();
                    } else {
                      setConfirming(true);
                    }
                  }}
                >
                  {confirming ? '确认删除？' : '删除系统'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
