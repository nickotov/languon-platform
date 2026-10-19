import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { twMerge } from 'tailwind-merge'
import { CheckIcon } from 'lucide-react'

export type PopoverProps = PopoverPrimitive.PopoverProps

/**
 * Root popover. Controls open state and holds the trigger + content.
 */
export function Popover(props: PopoverProps) {
  return <PopoverPrimitive.Root {...props} />
}

export type PopoverTriggerProps = PopoverPrimitive.PopoverTriggerProps

export const PopoverTrigger = PopoverPrimitive.Trigger as React.FC<PopoverTriggerProps>

export type PopoverAnchorProps = PopoverPrimitive.PopoverAnchorProps

export const PopoverAnchor = PopoverPrimitive.Anchor as React.FC<PopoverAnchorProps>

export type PopoverCloseProps = PopoverPrimitive.PopoverCloseProps

export const PopoverClose = PopoverPrimitive.Close as React.FC<PopoverCloseProps>

export interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  /** Show the small arrow pointing at the anchor. Defaults to false. */
  showArrow?: boolean
}

/**
 * Floating panel anchored to the trigger. Renders in a portal.
 */
export const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  (
    { className, align = 'center', sideOffset = 8, showArrow = false, children, ...props },
    ref,
  ) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={twMerge(
          'z-50 min-w-[10rem] max-w-xs rounded-lg border border-neutral-200 bg-white p-1.5 text-sm text-neutral-900 shadow-lg outline-none',
          className,
        )}
        {...props}
      >
        {children}
        {showArrow ? (
          <PopoverPrimitive.Arrow
            width={12}
            height={6}
            className="fill-white drop-shadow-[0_1px_0_rgb(229,229,229)]"
          />
        ) : null}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  ),
)
PopoverContent.displayName = 'PopoverContent'

export interface PopoverHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

/** Small uppercase label used at the top of a menu-style popover. */
export function PopoverHeader({ className, children, ...props }: PopoverHeaderProps) {
  return (
    <div
      className={twMerge(
        'px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export interface PopoverItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Renders a check mark and highlights the row. */
  selected?: boolean
  children: React.ReactNode
}

/** Selectable row for light contextual controls (e.g. playback speed). */
export const PopoverItem = React.forwardRef<HTMLButtonElement, PopoverItemProps>(
  ({ className, selected = false, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      className={twMerge(
        'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
        'hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-1',
        'disabled:pointer-events-none disabled:opacity-50',
        selected ? 'font-medium text-neutral-900' : 'text-neutral-700',
        className,
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
      {selected ? <CheckIcon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
    </button>
  ),
)
PopoverItem.displayName = 'PopoverItem'

export interface PopoverSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {}

/** Thin divider between groups of items. */
export function PopoverSeparator({ className, ...props }: PopoverSeparatorProps) {
  return <div role="separator" className={twMerge('my-1 h-px bg-neutral-200', className)} {...props} />
}

