import { BookOpenIcon, FileTextIcon, HomeIcon, LibraryIcon } from 'lucide-react';

export const NAV_ITEMS = [
  { label: 'Home', href: '/', icon: HomeIcon },
  { label: 'Dictionaries', href: '/dictionaries', icon: BookOpenIcon },
  { label: 'Texts', href: '/texts', icon: FileTextIcon },
  { label: 'Knowledge', href: '/knowledge', icon: LibraryIcon },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

