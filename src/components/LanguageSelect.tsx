import { ChevronDown, Languages } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { Lang } from '../i18n';
import { languages } from '../i18n';

interface Props {
  lang: Lang;
  onChange: (lang: Lang) => void;
}

export default function LanguageSelect({ lang, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="lang_selector" ref={ref}>
      <button
        type="button"
        className="lang_button"
        aria-label="Language"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Languages size={22} aria-hidden="true" />
        <span>{languages[lang]}</span>
        <ChevronDown
          size={18}
          className={open ? 'lang_chevron open' : 'lang_chevron'}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ul className="lang_menu" role="listbox" aria-label="Language">
          {(Object.keys(languages) as Lang[]).map((l, i) => (
            <li
              key={l}
              role="option"
              aria-selected={l === lang}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (l !== lang) onChange(l);
                }}
              >
                <span className="lang_radio" aria-hidden="true"></span>
                {languages[l]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
