import type { HeaderPair } from '@/lib/types';
import type { T } from '@/lib/i18n';

/**
 * Header 键值行：Key 在需求内应唯一。
 * 自由输入不阻断、不回滚（避免受控输入被改写导致增删字符的体感）；
 * 重复时仅描红提示，注入时同一需求内重复 Key 由后者覆盖（last-wins）。
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
  const key = pair.key.trim().toLowerCase();
  const duplicate = !!key && otherKeys.includes(key);

  return (
    <div className="pair-row">
      <input
        type="text"
        className={`key-input${duplicate ? ' invalid' : ''}`}
        value={pair.key}
        placeholder={t('requirement.keyPh')}
        title={duplicate ? t('requirement.keyDuplicate') : undefined}
        onChange={(e) => onKeyChange(e.target.value)}
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
