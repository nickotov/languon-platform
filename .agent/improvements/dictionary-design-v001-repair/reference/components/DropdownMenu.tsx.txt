import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { twMerge } from 'tailwind-merge'

export type DropdownMenuAlign = 'start' | 'end'

export type DropdownMenuContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  menuId: string
  triggerId: string
  triggerRef: React.RefObject<HTMLButtonElement>
  menuRef: React.RefObject<HTMLDivElement>
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null)

function useDropdownMenuContext(component: string): DropdownMenuContextValue {
  const context = useContext(DropdownMenuContext)
  if (!context) {
    throw new Error(`${component} must be used inside a <DropdownMenu>`)
  }
  return context
}

export type DropdownMenuProps = {
  /** Trigger content. Rendered inside the built-in trigger button unless `trigger` is provided. */
  label?: React.ReactNode
  /** Fully custom trigger. Receives nothing — wire it with `DropdownMenuTrigger` instead for full control. */
  trigger?: React.ReactNode
  /** Menu items, groups, labels and separators. */
  children: React.ReactNode
  /** Horizontal alignment of the menu relative to the trigger. */
  align?: DropdownMenuAlign
  /** Uncontrolled initial open state. */
  defaultOpen?: boolean
  /** Controlled open state. */
  open?: boolean
  /** Called whenever the open state should change. */
  onOpenChange?: (open: boolean) => void
  /** Disables the built-in trigger. */
  disabled?: boolean
  /** Extra classes for the wrapper element. */
  className?: string
  /** Extra classes for the menu surface. */
  menuClassName?: string
}

export function DropdownMenu({
  label,
  trigger,
  children,
  align = 'start',
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  disabled = false,
  className,
  menuClassName,
}: DropdownMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isControlled = openProp !== undefined
  const open = isControlled ? (openProp as boolean) : uncontrolledOpen

  const reactId = useId()
  const menuId = `dropdown-menu-${reactId}`
  const triggerId = `dropdown-trigger-${reactId}`

  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange],
  )

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, setOpen])

  useEffect(() => {
    if (!open) return
    const first = menuRef.current?.querySelector<HTMLElement>(
      '[role^="menuitem"]:not([aria-disabled="true"])',
    )
    first?.focus()
  }, [open])

  const context = useMemo<DropdownMenuContextValue>(
    () => ({ open, setOpen, menuId, triggerId, triggerRef, menuRef }),
    [open, setOpen, menuId, triggerId],
  )

  return (
    <DropdownMenuContext.Provider value={context}>
      <div ref={wrapperRef} className={twMerge('relative inline-block text-left', className)}>
        {trigger ?? <DropdownMenuTrigger disabled={disabled}>{label}</DropdownMenuTrigger>}
        {open && (
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-labelledby={triggerId}
            onKeyDown={(event) => handleMenuKeyDown(event, menuRef)}
            className={twMerge(
              'absolute z-50 mt-2 min-w-[13rem] rounded-lg border border-slate-200 bg-white p-1 shadow-lg focus:outline-none',
              align === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
              menuClassName,
            )}
          >
            {children}
          </div>
        )}
      </div>
    </DropdownMenuContext.Provider>
  )
}

export type DropdownMenuTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Hide the built-in chevron affordance. */
  hideChevron?: boolean
}

export function DropdownMenuTrigger({
  children,
  className,
  hideChevron = false,
  disabled,
  onClick,
  onKeyDown,
  ...rest
}: DropdownMenuTriggerProps) {
  const { open, setOpen, menuId, triggerId, triggerRef } =
    useDropdownMenuContext('DropdownMenuTrigger')

  return (
    <button
      {...rest}
      ref={triggerRef}
      id={triggerId}
      type="button"
      disabled={disabled}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) setOpen(!open)
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setOpen(true)
        }
      }}
      className={twMerge(
        'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {children}
      {!hideChevron && (
        <ChevronDownIcon
          aria-hidden="true"
          className={twMerge('h-4 w-4 text-slate-500 transition-transform', open && 'rotate-180')}
        />
      )}
    </button>
  )
}

export type DropdownMenuItemProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onSelect'
> & {
  /** Leading icon or avatar. */
  icon?: React.ReactNode
  /** Trailing hint, e.g. a keyboard shortcut. */
  shortcut?: React.ReactNode
  /** Renders the item in a destructive tone. */
  destructive?: boolean
  /** Keeps the menu open after activation. */
  closeOnSelect?: boolean
  /** Called when the item is activated by mouse or keyboard. */
  onSelect?: () => void
}

export function DropdownMenuItem({
  icon,
  shortcut,
  destructive = false,
  closeOnSelect = true,
  onSelect,
  children,
  className,
  disabled,
  onClick,
  role = 'menuitem',
  ...rest
}: DropdownMenuItemProps) {
  const { setOpen, triggerRef } = useDropdownMenuContext('DropdownMenuItem')

  return (
    <button
      {...rest}
      type="button"
      role={role}
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        onSelect?.()
        if (closeOnSelect) {
          setOpen(false)
          triggerRef.current?.focus()
        }
      }}
      className={twMerge(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors focus:outline-none',
        destructive
          ? 'text-red-600 hover:bg-red-50 focus-visible:bg-red-50'
          : 'text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100',
        disabled && 'pointer-events-none opacity-40',
        className,
      )}
    >
      {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="text-xs tabular-nums text-slate-400">{shortcut}</span>}
    </button>
  )
}

export type DropdownMenuCheckboxItemProps = Omit<DropdownMenuItemProps, 'icon' | 'onSelect'> & {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

export function DropdownMenuCheckboxItem({
  checked = false,
  onCheckedChange,
  children,
  closeOnSelect = false,
  ...rest
}: DropdownMenuCheckboxItemProps) {
  return (
    <DropdownMenuItem
      {...rest}
      role="menuitemcheckbox"
      aria-checked={checked}
      closeOnSelect={closeOnSelect}
      onSelect={() => onCheckedChange?.(!checked)}
      icon={
        checked ? (
          <CheckIcon aria-hidden="true" className="h-4 w-4 text-slate-900" />
        ) : (
          <span className="h-4 w-4" />
        )
      }
    >
      {children}
    </DropdownMenuItem>
  )
}

export function DropdownMenuLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={twMerge(
        'px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div role="separator" className={twMerge('my-1 h-px bg-slate-200', className)} />
}

function handleMenuKeyDown(
  event: React.KeyboardEvent<HTMLDivElement>,
  menuRef: React.RefObject<HTMLDivElement>,
) {
  const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
  if (!keys.includes(event.key)) return
  const items = Array.from(
    menuRef.current?.querySelectorAll<HTMLElement>(
      '[role^="menuitem"]:not([aria-disabled="true"])',
    ) ?? [],
  )
  if (items.length === 0) return
  event.preventDefault()

  const currentIndex = items.indexOf(document.activeElement as HTMLElement)
  let nextIndex = currentIndex

  if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length
  if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length
  if (event.key === 'Home') nextIndex = 0
  if (event.key === 'End') nextIndex = items.length - 1

  items[nextIndex]?.focus()
}

