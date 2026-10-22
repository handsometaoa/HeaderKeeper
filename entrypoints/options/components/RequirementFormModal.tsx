import { useState } from 'react';
import { addRequirement } from '@/lib/ops';
import type { LaneConfig, SystemEntry } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';

/** 新建需求弹窗；传 system 时创建后自动关联到该系统 */
export function RequirementFormModal({
  config,
  update,
  system,
  t,
  onClose,
}: {
  config: LaneConfig;
  update: Update;
  system?: SystemEntry;
  t: T;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameInvalid, setNameInvalid] = useState(false);

  const create = () => {
    const trimmed = name.trim();
    const duplicate = config.requirements.some((item) => item.name === trimmed);
    if (!trimmed || duplicate) {
      setNameInvalid(true);
      return;
    }
    const result = addRequirement(config, { name: trimmed, description }, system?.id);
    update(() => result.config);
    onClose();
  };

  return (
    <div className="modal-backdrop">
      <div
        className="modal req-form-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('requirement.createTitle')}
      >
        <div className="modal-head">
          <h3 className="modal-title">{t('requirement.createTitle')}</h3>
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
          {t('requirement.nameLabel')}
          <input
            type="text"
            autoFocus
            className={nameInvalid ? 'invalid' : ''}
            value={name}
            placeholder={t('requirements.createNamePh')}
            onChange={(e) => {
              setName(e.target.value);
              setNameInvalid(false);
            }}
          />
        </label>

        <label className="edit-label">
          {t('requirement.descLabel')}
          <input
            type="text"
            value={description}
            placeholder={t('requirements.createDescPh')}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn primary" onClick={create}>
            {system ? t('systems.createRequirement') : t('requirements.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
