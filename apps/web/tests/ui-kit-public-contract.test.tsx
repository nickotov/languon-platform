import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    DialogActions,
    PopoverAnchor,
    PopoverClose,
    PopoverContent,
    PopoverHeader,
    PopoverItem,
    PopoverSeparator,
    PopoverTrigger,
    ProgressBar,
    Radio,
    SkeletonCard,
    type BadgeProps,
    type CardProps,
    type CheckboxProps,
    type DialogProps,
    type IconButtonProps,
    type InlineAlertProps,
    type InputProps,
    type PopoverContentProps,
    type ProgressBarProps,
    type RadioGroupProps,
    type SelectProps,
    type SkeletonProps,
    type SwitchProps,
    type TabsProps,
    type TextareaProps,
    type ToastProps,
    type TooltipProps,
} from '@/fsd/shared/ui';

describe('shared UI public barrel', () => {
    it('exports compound component values without deep imports', () => {
        expect([
            CardContent,
            CardDescription,
            CardFooter,
            CardHeader,
            CardTitle,
            DialogActions,
            PopoverAnchor,
            PopoverClose,
            PopoverContent,
            PopoverHeader,
            PopoverItem,
            PopoverSeparator,
            PopoverTrigger,
            ProgressBar,
            Radio,
            SkeletonCard,
        ]).not.toContain(undefined);
    });

    it('exports public prop contracts for catalog consumers', () => {
        expectTypeOf<BadgeProps>().toBeObject();
        expectTypeOf<CardProps>().toBeObject();
        expectTypeOf<CheckboxProps>().toBeObject();
        expectTypeOf<DialogProps>().toBeObject();
        expectTypeOf<IconButtonProps>().toBeObject();
        expectTypeOf<InlineAlertProps>().toBeObject();
        expectTypeOf<InputProps>().toBeObject();
        expectTypeOf<PopoverContentProps>().toBeObject();
        expectTypeOf<ProgressBarProps>().toBeObject();
        expectTypeOf<RadioGroupProps>().toBeObject();
        expectTypeOf<SelectProps>().toBeObject();
        expectTypeOf<SkeletonProps>().toBeObject();
        expectTypeOf<SwitchProps>().toBeObject();
        expectTypeOf<TabsProps>().toBeObject();
        expectTypeOf<TextareaProps>().toBeObject();
        expectTypeOf<ToastProps>().toBeObject();
        expectTypeOf<TooltipProps>().toBeObject();
    });
});
