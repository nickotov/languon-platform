import React from "react";
import { MonitorIcon, MoonIcon, SunIcon, BoxIcon } from "lucide-react";
import { usePreferences } from "../../contexts/PreferencesContext";
import { Language } from "../../data/i18n";
import { ThemePreference } from "../../types/navigation";
type Option<T extends string> = {
  value: T;
  label: string;
  icon?: BoxIcon;
};
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-background-subtle p-0.5">
      {options.map(option => {
      const selected = option.value === value;
      const Icon = option.icon;
      return <button key={option.value} type="button" role="radio" aria-checked={selected} onClick={() => onChange(option.value)} className={`flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus ${selected ? 'bg-background-elevated text-text-primary shadow-elevation-sm' : 'text-text-secondary hover:text-text-primary'}`}>
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            <span className="truncate">{option.label}</span>
          </button>;
    })}
    </div>;
}
export function ThemeControl() {
  const {
    t,
    theme,
    setTheme
  } = usePreferences();
  const options: Option<ThemePreference>[] = [{
    value: 'system',
    label: t('theme.system'),
    icon: MonitorIcon
  }, {
    value: 'light',
    label: t('theme.light'),
    icon: SunIcon
  }, {
    value: 'dark',
    label: t('theme.dark'),
    icon: MoonIcon
  }];
  return <Segmented label={t('account.theme')} value={theme} options={options} onChange={setTheme} />;
}
export function LanguageControl() {
  const {
    t,
    language,
    setLanguage
  } = usePreferences();
  const options: Option<Language>[] = [{
    value: 'en',
    label: 'English'
  }, {
    value: 'ru',
    label: 'Русский'
  }];
  return <Segmented label={t('account.language')} value={language} options={options} onChange={setLanguage} />;
}
