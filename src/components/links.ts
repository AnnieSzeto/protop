export const navLinks = [
  { key: 'about', path: '/' },
  { key: 'business', path: '/business' },
  { key: 'news', path: '/news' },
  { key: 'contact', path: '/contact' },
] as const;

export type NavKey = (typeof navLinks)[number]['key'];
