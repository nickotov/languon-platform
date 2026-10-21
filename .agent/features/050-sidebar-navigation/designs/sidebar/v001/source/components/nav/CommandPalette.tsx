import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoonIcon, PlusIcon, SearchIcon, SettingsIcon, SunIcon, BoxIcon } from "lucide-react";
import { Dialog } from "../Dialog";
import { Kbd } from "./Kbd";
import { usePreferences } from "../../contexts/PreferencesContext";
import { useResources } from "../../contexts/ResourcesContext";
import { useShell } from "../../contexts/ShellContext";
import { navSections } from "../../data/navigation";
import { formatRelative, resourcePath } from "../../utils/navigation";
import { TranslationKey } from "../../data/i18n";
type PaletteGroup = 'recent' | 'results' | 'actions';
type PaletteItem = {
  id: string;
  label: string;
  meta?: string;
  icon: BoxIcon;
  group: PaletteGroup;
  run: () => void;
};
const groupLabel: Record<PaletteGroup, TranslationKey> = {
  recent: 'palette.recent',
  results: 'palette.results',
  actions: 'palette.actions'
};
export function CommandPalette({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    t,
    language,
    resolvedTheme,
    setTheme
  } = usePreferences();
  const {
    items
  } = useResources();
  const {
    openCreate
  } = useShell();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);
  const results = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? items.filter(r => r.title.toLowerCase().includes(q)).slice(0, 8) : [...items].sort((a, b) => a.minutesAgo - b.minutesAgo).slice(0, 5);
    const resourceItems: PaletteItem[] = matched.map(resource => {
      const section = navSections.find(s => s.resources?.kind === resource.kind);
      const detail = resource.languagePair ?? resource.folder;
      return {
        id: `r-${resource.id}`,
        label: resource.title,
        meta: [section ? t(section.labelKey) : '', detail, formatRelative(resource.minutesAgo, language)].filter(Boolean).join(' · '),
        icon: section?.icon ?? SearchIcon,
        group: q ? 'results' : 'recent',
        run: () => navigate(resourcePath(resource))
      };
    });
    const actions: PaletteItem[] = [...navSections.filter(s => s.status === 'live' && s.resources).map(s => ({
      id: `create-${s.id}`,
      label: t(s.resources!.createLabelKey),
      icon: PlusIcon,
      group: 'actions' as const,
      run: () => openCreate(s.resources!.kind)
    })), {
      id: 'settings',
      label: t('palette.goSettings'),
      icon: SettingsIcon,
      group: 'actions',
      run: () => navigate('/settings')
    }, {
      id: 'theme',
      label: t('palette.toggleTheme'),
      icon: resolvedTheme === 'dark' ? SunIcon : MoonIcon,
      group: 'actions',
      run: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
    }];
    return [...resourceItems, ...actions.filter(a => !q || a.label.toLowerCase().includes(q))];
  }, [query, items, language, t, navigate, openCreate, resolvedTheme, setTheme]);
  useEffect(() => setActiveIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({
      block: 'nearest'
    });
  }, [activeIndex]);
  const runItem = (item: PaletteItem) => {
    onClose();
    window.setTimeout(item.run, 0);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      runItem(results[activeIndex]);
    }
  };
  const listboxId = 'command-palette-results';
  return <Dialog open={open} onClose={onClose} title={t('palette.label')} showHeader={false} size="md" className="overflow-hidden p-0">
      <div className="flex flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-border-default px-4">
          <SearchIcon className="h-5 w-5 shrink-0 text-text-tertiary" aria-hidden="true" />
          <input autoFocus value={query} onChange={event => setQuery(event.target.value)} onKeyDown={onKeyDown} placeholder={t('palette.placeholder')} role="combobox" aria-expanded="true" aria-controls={listboxId} aria-activedescendant={results[activeIndex] ? `palette-${results[activeIndex].id}` : undefined} aria-label={t('palette.label')} className="min-w-0 flex-1 bg-transparent text-base text-text-primary outline-none placeholder:text-text-tertiary" />
        </div>
        <ul ref={listRef} id={listboxId} role="listbox" aria-label={t('palette.label')} className="max-h-96 overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-text-tertiary">{t('palette.noResults', {
            q: query
          })}</li>}
          {results.map((item, index) => {
          const Icon = item.icon;
          const showHeading = index === 0 || results[index - 1].group !== item.group;
          const active = index === activeIndex;
          return <React.Fragment key={item.id}>
                {showHeading && <li role="presentation" className="px-3 pb-1 pt-3 text-xs font-medium text-text-tertiary first:pt-1">
                    {t(groupLabel[item.group])}
                  </li>}
                <li id={`palette-${item.id}`} role="option" aria-selected={active} data-index={index} onMouseMove={() => setActiveIndex(index)} onClick={() => runItem(item)} className={`flex h-11 cursor-pointer items-center gap-3 rounded-lg px-3 ${active ? 'bg-background-subtle' : ''}`}>
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary-default' : 'text-text-tertiary'}`} strokeWidth={1.75} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{item.label}</span>
                  {item.meta && <span className="hidden shrink-0 truncate text-xs text-text-tertiary sm:block">{item.meta}</span>}
                </li>
              </React.Fragment>;
        })}
        </ul>
        <div className="hidden items-center gap-4 border-t border-border-default px-4 py-2.5 text-xs text-text-tertiary sm:flex">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd>{t('palette.hintNavigate')}</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd>{t('palette.hintOpen')}</span>
          <span className="flex items-center gap-1"><Kbd>esc</Kbd>{t('palette.hintClose')}</span>
        </div>
      </div>
    </Dialog>;
}
