import { useState } from 'react';
import { addSystem, updateSystem } from '@/lib/ops';
import type { LaneConfig, SystemEntry } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';
import { DomainEditor } from './DomainEditor';

/** 新建 / 编辑系统弹窗：名称 + 多个匹配域名 */
export function SystemFormModal({
  config,
  update,
  system,
  t,
  onClose,
  onSaved,
}: {
  config: LaneConfig;
  update: Update;
  system?: SystemEntry;
  t: T;
  onClose: () => void;
  onSaved?: (systemId: string) => void;
}) {
  const editing = !!system;
  const [name, setName] = useState(system?.name ?? '');
  const [domains, setDomains] = useState<string[]>(system?.domains ?? []);
  const [nameInvalid, setNameInvalid] = useState(false);
  const [domainsInvalid, setDomainsInvalid] = useState(false);

  const save = () => {
    const trimmed = name.trim();
    const duplicate = config.systems.some(
      (s) => s.id !== system?.id && s.name === trimmed,
    );
    const invalidName = !trimmed || duplicate;
    const invalidDomains = domains.length === 0;
    setNameInvalid(invalidName);
    setDomainsInvalid(invalidDomains);
    if (invalidName || invalidDomains) return;

    if (system) {
      update((cfg) =>
        updateSystem(cfg, system.id, (s) => ({ ...s, name: trimmed, domains })),
      );
      onClose();
      return;
    }

    const result = addSystem(config, { name: trimmed, domains });
    update(() => result.config);
    onClose();
    onSaved?.(result.systemId);
  };

  const title = editing ? t('systems.editTitle') : t('systems.newTitle');

  return (
    <div className="modal-backdrop">
      <div
        className="modal system-form-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h3 className="modal-title">{title}</h3>
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
            className={nameInvalid ? 'invalid' : ''}
            value={name}
            placeholder={t('systems.namePh')}
            onChange={(e) => {
              setName(e.target.value);
              setNameInvalid(false);
            }}
          />
        </label>

        <div className="edit-label">
          {t('systems.domains')}
          <DomainEditor
            domains={domains}
            onChange={(next) => {
              setDomains(next);
              setDomainsInvalid(false);
            }}
            t={t}
            invalid={domainsInvalid}
          />
        </div>

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn primary" onClick={save}>
            {editing ? t('common.save') : t('systems.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
