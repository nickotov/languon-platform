import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { MenuIcon, XIcon } from 'lucide-react'
import { IconButton } from '../IconButton'
import { Logo } from '../Logo'
import { SidebarNav } from './SidebarNav'
import { useFocusTrap } from '../../hooks/useFocusTrap'

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { pathname } = useLocation()
  const drawerRef = useRef<HTMLDivElement>(null)
  useFocusTrap(drawerOpen, drawerRef, () => setDrawerOpen(false))

  useEffect(() => setDrawerOpen(false), [pathname])

  return (
    <div className="min-h-screen w-full bg-background-canvas">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r border-border-default bg-background-surface lg:block">
        <SidebarNav />
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border-default bg-background-surface px-3 lg:hidden">
        <IconButton icon={<MenuIcon />} label="Open navigation" variant="ghost" onClick={() => setDrawerOpen(true)} />
        <Logo variant="lockup" size="sm" href="/texts" />
      </header>

      {createPortal(
        <AnimatePresence>
          {drawerOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <motion.div
                className="absolute inset-0 bg-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDrawerOpen(false)}
                aria-hidden
              />
              <motion.div
                ref={drawerRef}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation"
                tabIndex={-1}
                className="absolute inset-y-0 left-0 flex w-72 max-w-full flex-col bg-background-surface shadow-lg"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              >
                <div className="absolute right-2 top-3">
                  <IconButton icon={<XIcon />} label="Close navigation" variant="ghost" onClick={() => setDrawerOpen(false)} />
                </div>
                <SidebarNav onNavigate={() => setDrawerOpen(false)} />
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <main className="min-w-0 lg:pl-60">
        <Outlet />
      </main>
    </div>
  )
}
