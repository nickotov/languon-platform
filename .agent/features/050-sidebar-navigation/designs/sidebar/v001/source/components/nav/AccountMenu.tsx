import React from "react";
import { useNavigate } from "react-router-dom";
import { ChevronsUpDownIcon, LogOutIcon, SettingsIcon, SparklesIcon, UserIcon, BoxIcon } from "lucide-react";
import { Popover, PopoverClose, PopoverContent, PopoverSeparator, PopoverTrigger } from "../Popover";
import { Avatar } from "../Avatar";
import { LanguageControl, ThemeControl } from "./PreferenceControls";
import { usePreferences } from "../../contexts/PreferencesContext";
const user = {
  name: 'Anna Volkova',
  email: 'anna.volkova@gmail.com'
};
type AccountMenuProps = {
  variant: 'expanded' | 'collapsed';
  onNavigate?: () => void;
};
export function AccountMenu({
  variant,
  onNavigate
}: AccountMenuProps) {
  const {
    t
  } = usePreferences();
  const navigate = useNavigate();
  const go = (path: string) => {
    navigate(path);
    onNavigate?.();
  };
  return <Popover>
      {variant === 'expanded' ? <PopoverTrigger aria-label={t('account.menu')} className="flex h-12 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 text-left outline-none transition-colors hover:bg-background-elevated focus-visible:ring-2 focus-visible:ring-border-focus data-[state=open]:bg-background-elevated">
          <Avatar name={user.name} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-text-primary">{user.name}</span>
            <span className="block truncate text-xs text-text-tertiary">{user.email}</span>
          </span>
          <ChevronsUpDownIcon className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        </PopoverTrigger> : <PopoverTrigger aria-label={`${t('account.menu')} — ${user.name}`} className="flex h-10 w-10 items-center justify-center rounded-lg outline-none transition-colors hover:bg-background-elevated focus-visible:ring-2 focus-visible:ring-border-focus">
          <Avatar name={user.name} size="sm" />
        </PopoverTrigger>}
      <PopoverContent side={variant === 'expanded' ? 'top' : 'right'} align={variant === 'expanded' ? 'start' : 'end'} sideOffset={8} collisionPadding={12} className="w-72 p-1.5">
        <div className="flex items-center gap-3 px-2 pb-3 pt-2">
          <Avatar name={user.name} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">{user.name}</p>
            <p className="truncate text-xs text-text-tertiary">{user.email}</p>
          </div>
        </div>
        <div role="group">
          <MenuRow icon={UserIcon} label={t('account.profile')} onClick={() => go('/settings#profile')} />
          <MenuRow icon={SettingsIcon} label={t('account.settings')} onClick={() => go('/settings')} />
          <MenuRow icon={SparklesIcon} label={t('account.ai')} onClick={() => go('/settings#ai')} />
        </div>
        <PopoverSeparator />
        <div className="space-y-3 px-2 py-2">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-text-tertiary">{t('account.theme')}</p>
            <ThemeControl />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-text-tertiary">{t('account.language')}</p>
            <LanguageControl />
          </div>
        </div>
        <PopoverSeparator />
        <MenuRow icon={LogOutIcon} label={t('account.logout')} destructive onClick={() => onNavigate?.()} />
      </PopoverContent>
    </Popover>;
}
function MenuRow({
  icon: Icon,
  label,
  onClick,
  destructive = false
}: {
  icon: BoxIcon;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return <PopoverClose asChild>
      <button type="button" onClick={onClick} className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus ${destructive ? 'text-danger-default hover:bg-danger-subtle' : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary'}`}>
        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </button>
    </PopoverClose>;
}
