import { useEffect, useState } from 'react';
import type { HeaderPair } from '@/lib/types';
import type { T } from '@/lib/i18n';

/**
 * Header 键值行：Key 在需求内必须唯一。
 * 重复时输入框描红并保留草稿，失焦后恢复为已保存的 Key；不会写入重复值。
 */
export function HeaderPairRow({
  pair,
  otherKeys,
  onKeyChange,
  onValueChange,
  onDelete,
  t,
}: {
  pair: HeaderPair;
  /** 同一需求内其他 Key（已转小写并去空格） */
  otherKeys: string[];
  onKeyChange: (value: string) => void;
  onValueChange: (value: string) => void;
  onDelete: () => void;
  t: T;
}) {
  const [keyDraft, setKeyDraft] = useState(pair.key);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setKeyDraft(pair.key);
    setInvalid(false);
  }, [pair.key]);

  const handleKey = (value: string) => {
    setKeyDraft(value);
    const key = value.trim().toLowerCase();
    const duplicate = !!key && otherKeys.includes(key);
    setInvalid(duplicate);
    if (!duplicate) onKeyChange(value);
  };

  return (
    <div className="pair-row">
      <input
        type="text"
        className={`key-input${invalid ? ' invalid' : ''}`}
        value={keyDraft}
        placeholder={t('requirement.keyPh')}
        title={invalid ? t('requirement.keyDuplicate') : undefined}
        onChange={(e) => handleKey(e.target.value)}
        onBlur={() => {
          if (invalid) {
            setKeyDraft(pair.key);
            setInvalid(false);
          }
        }}
      />
      <input
        type="text"
        value={pair.value}
        placeholder={t('requirement.valuePh')}
        onChange={(e) => onValueChange(e.target.value)}
      />
      <button
        type="button"
        className="icon-btn"
        title={t('requirement.delHeaderTitle')}
        onClick={onDelete}
      >
        ✕
      </button>
    </div>
  );
}
