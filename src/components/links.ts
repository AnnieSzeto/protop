export const navLinks = [
  { key: 'about', path: '/' },
  { key: 'products', path: '/products' },
  { key: 'contact', path: '/contact' },
] as const;

export type NavKey = (typeof navLinks)[number]['key'];
