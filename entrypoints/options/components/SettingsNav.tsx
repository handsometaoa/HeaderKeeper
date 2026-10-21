import type { ReactNode } from 'react';
import type { T } from '@/lib/i18n';

export type Section = 'general' | 'systems' | 'requirements' | 'about';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const icons: Record<Section, ReactNode> = {
  general: (
    <Icon>
      <line x1="21" y1="4" x2="14" y2="4" />
      <line x1="10" y1="4" x2="3" y2="4" />
      <line x1="21" y1="12" x2="12" y2="12" />
      <line x1="8" y1="12" x2="3" y2="12" />
      <line x1="21" y1="20" x2="16" y2="20" />
      <line x1="12" y1="20" x2="3" y2="20" />
      <line x1="14" y1="2" x2="14" y2="6" />
      <line x1="8" y1="10" x2="8" y2="14" />
      <line x1="16" y1="18" x2="16" y2="22" />
    </Icon>
  ),
  systems: (
    <Icon>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </Icon>
  ),
  requirements: (
    <Icon>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </Icon>
  ),
  about: (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </Icon>
  ),
};

export function SettingsNav({
  section,
  onChange,
  t,
}: {
  section: Section;
  onChange: (section: Section) => void;
  t: T;
}) {
  const items: { id: Section; label: string }[] = [
    { id: 'general', label: t('settings.nav.general') },
    { id: 'systems', label: t('settings.nav.systems') },
    { id: 'requirements', label: t('settings.nav.requirements') },
    { id: 'about', label: t('settings.nav.about') },
  ];

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const current = items.findIndex((item) => item.id === section);
    const next =
      e.key === 'ArrowDown'
        ? (current + 1) % items.length
        : (current - 1 + items.length) % items.length;
    onChange(items[next]!.id);
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('.nav-item');
    buttons[next]?.focus();
  };

  return (
    <nav
      className="nav-list"
      role="tablist"
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={section === item.id}
          className={`nav-item${section === item.id ? ' active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          <span className="nav-item-icon">{icons[item.id]}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
