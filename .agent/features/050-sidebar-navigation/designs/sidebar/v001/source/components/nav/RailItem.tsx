import React, { forwardRef } from "react";
import { BoxIcon } from "lucide-react";
type RailItemBaseProps = {
  icon: BoxIcon;
  label: string;
  active?: boolean;
};
export function railItemClass(active: boolean, disabled = false): string {
  const base = 'relative flex h-10 w-10 items-center justify-center rounded-lg outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-border-focus';
  if (disabled) return `${base} cursor-not-allowed text-text-disabled`;
  return active ? `${base} bg-primary-subtle text-primary-default` : `${base} text-text-secondary hover:bg-background-elevated hover:text-text-primary`;
}
function ActiveBar({
  active
}: {
  active?: boolean;
}) {
  if (!active) return null;
  return <span aria-hidden="true" className="absolute -left-3 top-2 bottom-2 w-1 rounded-r-full bg-primary-default" />;
}

/** Icon-only button for the collapsed rail (flyout triggers, search, toggles). */
export const RailButton = forwardRef<HTMLButtonElement, RailItemBaseProps & React.ButtonHTMLAttributes<HTMLButtonElement>>(function RailButton({
  icon: Icon,
  label,
  active = false,
  disabled,
  className = '',
  ...rest
}, ref) {
  return <button ref={ref} type="button" aria-label={label} disabled={disabled} className={`${railItemClass(active, disabled)} ${className}`} {...rest}>
        <ActiveBar active={active} />
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </button>;
});

/** Icon-only navigation link for the collapsed rail. */
export const RailLink = forwardRef<HTMLAnchorElement, RailItemBaseProps & React.AnchorHTMLAttributes<HTMLAnchorElement>>(function RailLink({
  icon: Icon,
  label,
  active = false,
  className = '',
  ...rest
}, ref) {
  return <a ref={ref} aria-label={label} aria-current={active ? 'page' : undefined} className={`${railItemClass(active)} ${className}`} {...rest}>
        <ActiveBar active={active} />
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </a>;
});
