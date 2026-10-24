import { useEffect, useState } from 'react';
import type { Requirement } from '@/lib/types';
import type { T } from '@/lib/i18n';

/** 关联已有需求：只展示未关联到当前系统且未过期的需求（由调用方过滤） */
export function RequirementPicker({
  requirements,
  onLink,
  onClose,
  t,
}: {
  requirements: Requirement[];
  onLink: (requirementId: string) => void;
  onClose: () => void;
  t: T;
}) {
  const [search, setSearch] = useState('');

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
          {filtered.map((requirement) => (
            <div className="modal-item" key={requirement.id}>
              <div className="modal-item-main">
                <div className="modal-item-name">
                  {requirement.name || t('requirement.unnamed')}
                </div>
                <div className="modal-item-desc">{requirement.description || '—'}</div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => onLink(requirement.id)}
              >
                {t('picker.link')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
