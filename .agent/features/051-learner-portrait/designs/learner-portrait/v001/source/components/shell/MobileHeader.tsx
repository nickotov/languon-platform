import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MenuIcon, SettingsIcon, XIcon } from 'lucide-react';
import { Logo } from '../Logo';
import { NavItem } from '../NavItem';
import { NAV_ITEMS, isActive } from './navItems';

export function MobileHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
      const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
    triggerRef.current?.focus({ preventScroll: true });
    return undefined;
  }, [open]);

  const go = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(href);
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border-default bg-background-surface px-2 md:hidden">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-text-primary outline-none hover:bg-background-subtle focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <MenuIcon className="h-5 w-5" aria-hidden="true" />
        </button>
        <Logo variant="lockup" size="sm" href="/" />
        <a
          href="/settings"
          onClick={go('/settings')}
          aria-label="Account & settings"
          className="flex h-11 w-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary-default">
            MC
          </span>
        </a>
      </header>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <motion.div
              className="absolute inset-0 bg-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.nav
              className="absolute inset-y-0 left-0 flex w-72 max-w-full flex-col bg-background-surface"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              <div className="flex h-14 items-center justify-between border-b border-border-default px-4">
                <Logo variant="lockup" size="sm" />
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close navigation"
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-text-secondary outline-none hover:bg-background-subtle focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <XIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <ul className="flex-1 space-y-1 p-2">
                {NAV_ITEMS.map((item) => (
                  <li key={item.href}>
                    <NavItem label={item.label} icon={item.icon} href={item.href} active={isActive(location.pathname, item.href)} onClick={go(item.href)} />
                  </li>
                ))}
              </ul>
              <div className="border-t border-border-default p-2">
                <NavItem label="Account & settings" icon={SettingsIcon} href="/settings" active={location.pathname.startsWith('/settings')} onClick={go('/settings')} />
              </div>
            </motion.nav>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

