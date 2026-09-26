import { navigate } from 'astro:transitions/client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { Lang, Translations } from '../i18n';
import { localizePath } from '../i18n';
import LanguageSelect from './LanguageSelect';
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
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  // Only animate the bar after its first placement, so it doesn't slide in on page load.
  const [animateBar, setAnimateBar] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // The header persists between pages, so the current-page bar can slide to the new link.
  useLayoutEffect(() => {
    const place = () => {
      const link = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
      setIndicator(link ? { left: link.offsetLeft, width: link.offsetWidth } : null);
    };
    place();
    const frame = requestAnimationFrame(() => setAnimateBar(true));
    document.fonts?.ready.then(place);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
    };
  }, [current, lang]);

  // Close the mobile menu after navigating.
  useEffect(() => setNavOpen(false), [current, lang]);

  useEffect(() => {
    const onScroll = () => setIsSticky(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!navOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setNavOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [navOpen]);

  const changeLanguage = (next: Lang) => {
    navigate(localizePath(path, next));
  };

  return (
    <div ref={headerRef} className="h_wrapper">
      <header id="h_bar" className={isSticky ? 'sticky isSticky' : 'sticky'}>
        <a href={localizePath('/', lang)} className="h_logo">
          <img src="https://placehold.co/600x600/transparent/white?text=PTI" alt="Protop logo" />
        </a>
        <div className="h_options">
          <LanguageSelect lang={lang} onChange={changeLanguage} />
          <nav className="nav" ref={navRef}>
            {navLinks.map(({ key, path: p }) => (
              <a
                key={key}
                href={localizePath(p, lang)}
                className="h_link"
                aria-current={current === key ? 'page' : undefined}
              >
                {links[key]}
              </a>
            ))}
            <span
              className={animateBar ? 'h_indicator animate' : 'h_indicator'}
              aria-hidden="true"
              style={
                indicator
                  ? { translate: `${indicator.left}px 0`, width: indicator.width }
                  : { opacity: 0 }
              }
            ></span>
          </nav>
          <button
            id="hamburger"
            className={navOpen ? 'h_link open' : 'h_link'}
            aria-label="Menu"
            aria-expanded={navOpen}
            aria-controls="mobile_menu"
            onClick={() => setNavOpen((o) => !o)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </header>
      <ul id="mobile_menu" className={navOpen ? 'open' : undefined} aria-hidden={!navOpen}>
        {navLinks.map(({ key, path: p }, i) => (
          <li key={key} style={{ transitionDelay: `${100 + (i + 1) * 100}ms` }}>
            <a
              href={localizePath(p, lang)}
              tabIndex={navOpen ? 0 : -1}
              className={current === key ? 'current' : undefined}
            >
              {links[key]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
