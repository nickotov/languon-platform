import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BookMarkedIcon, ChevronDownIcon, FileTextIcon, SettingsIcon } from 'lucide-react'
import { Avatar } from '../Avatar'
import { Logo } from '../Logo'
import { NavItem } from '../NavItem'
import { useTextsStore } from '../../contexts/TextsStore'

interface SidebarNavProps {
  onNavigate?: () => void
}

export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { dictionaries } = useTextsStore()
  const inDictionaries = pathname.startsWith('/dictionaries')
  const [dictOpen, setDictOpen] = useState(inDictionaries)

  const go = (to: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    navigate(to)
    onNavigate?.()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo variant="lockup" size="sm" href="/texts" />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-1">
          <li>
            <button
              type="button"
              aria-expanded={dictOpen}
              aria-controls="nav-dictionaries"
              onClick={() => setDictOpen((o) => !o)}
              className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors hover:bg-background-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${
                inDictionaries ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              <BookMarkedIcon className="h-5 w-5" aria-hidden />
              <span className="flex-1 text-left">Dictionaries</span>
              <ChevronDownIcon className={`h-4 w-4 transition-transform ${dictOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {dictOpen && (
              <ul id="nav-dictionaries" className="ml-6 mt-1 space-y-1 border-l border-border-default pl-2">
                {dictionaries.map((d) => (
                  <li key={d.id}>
                    <NavItem
                      label={d.name}
                      href={`/dictionaries/${d.id}`}
                      onClick={go(`/dictionaries/${d.id}`)}
                      active={pathname === `/dictionaries/${d.id}`}
                      className="truncate"
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
          <li>
            <NavItem
              label="Texts"
              icon={FileTextIcon}
              href="/texts"
              onClick={go('/texts')}
              active={pathname.startsWith('/texts')}
            />
          </li>
        </ul>
      </nav>
      <div className="border-t border-border-default p-3">
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-background-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus"
          aria-label="Profile and preferences"
        >
          <Avatar name="Maya Torres" size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-text-primary">Maya Torres</span>
            <span className="block truncate text-xs text-text-tertiary">Preferences</span>
          </span>
          <SettingsIcon className="h-4 w-4 text-text-tertiary" aria-hidden />
        </button>
      </div>
    </div>
  )
}
