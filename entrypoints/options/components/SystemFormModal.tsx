import { useState } from 'react';
import { addSystem } from '@/lib/ops';
import type { LaneConfig } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';
import { DomainEditor } from './DomainEditor';

/** 新建系统弹窗：名称 + 多个匹配域名 */
export function SystemFormModal({
  config,
  update,
  t,
  onClose,
  onCreated,
}: {
  config: LaneConfig;
  update: Update;
  t: T;
  onClose: () => void;
  onCreated: (systemId: string) => void;
}) {
  const [name, setName] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [error, setError] = useState('');

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('systems.nameRequired'));
      return;
    }
    if (config.systems.some((s) => s.name === trimmed)) {
      setError(t('systems.nameDuplicate'));
      return;
    }
    if (domains.length === 0) {
      setError(t('systems.domainRequired'));
      return;
    }
    const result = addSystem(config, { name: trimmed, domains });
    update(() => result.config);
    onClose();
    onCreated(result.systemId);
  };

  return (
    <div className="modal-backdrop">
      <div
        className="modal system-form-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('systems.newTitle')}
      >
        <div className="modal-head">
          <h3 className="modal-title">{t('systems.newTitle')}</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label={t('common.cancel')}
          >
            ✕
          </button>
        </div>

        <label className="edit-label">
          {t('systems.name')}
          <input
            type="text"
            autoFocus
            value={name}
            placeholder={t('systems.namePh')}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
          />
        </label>

        <div className="edit-label">
          {t('systems.domains')}
          <DomainEditor domains={domains} onChange={setDomains} t={t} />
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn primary" onClick={create}>
            {t('systems.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
