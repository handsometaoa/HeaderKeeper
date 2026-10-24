import { useEffect, useState } from 'react';
import type { Requirement } from '@/lib/types';
import type { T } from '@/lib/i18n';

/** 关联已有需求：多选（整行点选），只展示未关联到当前系统且未过期的需求（由调用方过滤） */
export function RequirementPicker({
  requirements,
  onLink,
  onClose,
  t,
}: {
  requirements: Requirement[];
  onLink: (requirementIds: string[]) => void;
  onClose: () => void;
  t: T;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const query = search.trim().toLowerCase();
  const filtered = requirements.filter(
    (r) =>
      !query ||
      r.name.toLowerCase().includes(query) ||
      r.headers.some((h) => h.value.toLowerCase().includes(query)),
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = () => {
    if (selected.size === 0) return;
    onLink([...selected]);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('picker.title')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 className="modal-title">{t('picker.title')}</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label={t('picker.close')}
          >
            ✕
          </button>
        </div>
        <input
          type="text"
          autoFocus
          value={search}
          placeholder={t('picker.search')}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="modal-list">
          {filtered.length === 0 && <div className="modal-empty">{t('picker.empty')}</div>}
          {filtered.map((requirement) => {
            const checked = selected.has(requirement.id);
            return (
              <button
                type="button"
                className={`modal-item picker-item${checked ? ' selected' : ''}`}
                key={requirement.id}
                aria-pressed={checked}
                onClick={() => toggle(requirement.id)}
              >
                <input type="checkbox" className="picker-check" checked={checked} readOnly />
                <div className="modal-item-main">
                  <div className="modal-item-name">
                    {requirement.name || t('requirement.unnamed')}
                  </div>
                  <div className="modal-item-desc">{requirement.description || '—'}</div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="picker-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn primary picker-link"
            disabled={selected.size === 0}
            onClick={confirm}
          >
            {t('picker.linkSelected', { n: selected.size })}
          </button>
        </div>
      </div>
    </div>
  );
}
