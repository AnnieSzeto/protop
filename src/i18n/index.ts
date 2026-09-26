import en from './en.json';
import hk from './hk.json';
import zh from './zh.json';

export const languages = {
  en: 'English',
  zh: '中文 (简体)',
  hk: '中文 (繁體)',
} as const;

export type Lang = keyof typeof languages;
export type Translations = typeof en;

const translations: Record<Lang, Translations> = { en, zh, hk };

export const defaultLang: Lang = 'en';

export function isLang(value: string | undefined): value is Lang {
  return !!value && value in languages;
}

export function useTranslations(lang: Lang): Translations {
  return translations[lang];
}

/** Paths for every language: English at the root, others under /<lang>/. */
export function getLangStaticPaths() {
  return (Object.keys(languages) as Lang[]).map((lang) => ({
    params: { lang: lang === defaultLang ? undefined : lang },
  }));
}

export function langFromParam(param: string | undefined): Lang {
  return isLang(param) ? param : defaultLang;
}

/** Build a localized URL for a page path like '/business'. */
export function localizePath(path: string, lang: Lang): string {
  const clean = path === '/' ? '' : path;
  return lang === defaultLang ? clean || '/' : `/${lang}${clean}`;
}

/** Strip any language prefix from a pathname, returning e.g. '/business'. */
export function stripLang(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (isLang(parts[0])) parts.shift();
  return '/' + parts.join('/');
}
