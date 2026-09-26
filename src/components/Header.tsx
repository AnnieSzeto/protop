import { Languages, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { Lang, Translations } from '../i18n';
import { languages, localizePath } from '../i18n';
import type { NavKey } from './links';
import { navLinks } from './links';

interface Props {
  lang: Lang;
  links: Translations['links'];
  current?: NavKey;
  /** Current page path without language prefix, e.g. '/business'. */
  path: string;
}

export default function Header({ lang, links, current, path }: Props) {
  const [isSticky, setIsSticky] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setIsSticky(window.scrollY > 20);
    onScroll();
    document.addEventListener('scroll', onScroll);
    return () => document.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (navOpen) navRef.current?.focus();
  }, [navOpen]);

  const changeLanguage = (next: Lang) => {
    window.location.href = localizePath(path, next);
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setNavOpen(false);
  };

  return (
    <>
      <header id="h_bar" className={isSticky ? 'sticky isSticky' : 'sticky'}>
        <a href={localizePath('/', lang)} className="h_logo">
          <img src="https://placehold.co/600x600/transparent/white?text=PTI" alt="Protop logo" />
        </a>
        <div className="h_options">
          <div className="lang_selector">
            <Languages size={24} aria-hidden="true" />
            <select
              id="language-select"
              aria-label="Language"
              value={lang}
              onChange={(e) => changeLanguage(e.target.value as Lang)}
            >
              {(Object.keys(languages) as Lang[]).map((l) => (
                <option key={l} value={l}>
                  {languages[l]}
                </option>
              ))}
            </select>
          </div>
          <nav className="nav">
            <a id="hamburger" role="button" aria-label="Menu" onClick={() => setNavOpen(true)}>
              <Menu size={28} aria-hidden="true" />
            </a>
            {navLinks.map(({ key, path: p }) => (
              <a
                key={key}
                href={localizePath(p, lang)}
                className={current === key ? 'h_underline' : undefined}
              >
                {links[key]}
              </a>
            ))}
          </nav>
        </div>
        <div id="darker" style={{ display: navOpen ? 'block' : 'none' }}></div>
      </header>
      <div>
        <div
          id="nav_container"
          ref={navRef}
          tabIndex={0}
          onBlur={handleBlur}
          style={{ right: navOpen ? '0rem' : '-16rem' }}
        >
          <nav id="hidden_nav">
            <button className="h_nav_close" aria-label="Close" onClick={() => setNavOpen(false)}>
              <X size={24} color="#ffffff" aria-hidden="true" />
            </button>
            <div className="h_nav_gap"></div>
            {navLinks.map(({ key, path: p }) => (
              <a key={key} href={localizePath(p, lang)}>
                {links[key]}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}
