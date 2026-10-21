import type { PortraitItems } from '@languon/contracts';
import {
    emptyPortraitItems,
    portraitDetails,
} from '@/fsd/features/portrait-editor';
import type { Locale } from '@/fsd/shared/i18n';
import type { PortraitField } from '../../lib/reconciliation';

/** Use the editor's localized values without rendering unrelated empty sections. */
export function conflictFieldValue(
    items: PortraitItems,
    field: PortraitField,
    locale: Locale,
): string {
    const selected = Object.assign(emptyPortraitItems(), {
        [field]: items[field],
    });
    return (
        portraitDetails(selected, locale).find((row) => row.value)?.value ?? '—'
    );
}
