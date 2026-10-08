import { BookOpen, MessageSquareText, MoreHorizontal } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Menu } from '@/fsd/shared/ui';

/** Shared viewers have personal read actions, without owner editing controls. */
export function SharedPracticeActions({
    signedIn,
    sentencesEnabled,
    onOpenLibrary,
    onOpenHistory,
}: {
    signedIn: boolean;
    sentencesEnabled: boolean;
    onOpenLibrary(): void;
    onOpenHistory(): void;
}) {
    const { t } = useI18n();
    if (!signedIn) return null;
    const items = [
        {
            label: t('dictionary.editor.savedSentences'),
            icon: <MessageSquareText size={16} aria-hidden />,
            disabled: !sentencesEnabled,
            onSelect: onOpenLibrary,
        },
        {
            label: t('dictionary.editor.practiceHistory'),
            icon: <BookOpen size={16} aria-hidden />,
            onSelect: onOpenHistory,
        },
    ];
    return (
        <Menu
            label={t('dictionary.editor.actions')}
            trigger={<MoreHorizontal size={18} aria-hidden />}
            variant='secondary'
            triggerClassName='!h-10 !w-10 !min-h-10 border border-border-strong bg-background-surface text-text-primary'
            menuClassName='bg-background-elevated text-text-primary border-border-default'
            iconOnly
            items={items}
        />
    );
}
