import componentStyles from '../../styles/library-states-common.module.css';
import { EyeOffIcon, FilterXIcon, MessageSquareTextIcon } from 'lucide-react';
import { Button } from '@/fsd/shared/ui';
import type { LibraryKey } from '../../../lib/copy';
import { useInterfaceText } from '../../../hooks/use-interface-text';

type EmptyKind = 'none' | 'no-results' | 'archive-empty';

export function LibraryEmpty({
    kind,
    onReset,
    onPractice,
}: {
    kind: EmptyKind;
    onReset?: () => void;
    onPractice?: () => void;
}) {
    const { L } = useInterfaceText();
    let Icon;
    let titleKey: LibraryKey;
    let bodyKey: LibraryKey;
    if (kind === 'none') {
        Icon = MessageSquareTextIcon;
        titleKey = 'emptyTitle';
        bodyKey = 'emptyBody';
    } else if (kind === 'archive-empty') {
        Icon = EyeOffIcon;
        titleKey = 'archiveEmptyTitle';
        bodyKey = 'archiveEmptyBody';
    } else {
        Icon = FilterXIcon;
        titleKey = 'noResultsTitle';
        bodyKey = 'noResultsBody';
    }

    const title = L(titleKey);
    const body = L(bodyKey);

    return (
        <div className={componentStyles.emptyState}>
            <span className={componentStyles.emptyIcon}>
                <Icon aria-hidden className={componentStyles.icon} />
            </span>
            <h2 className={componentStyles.emptyHeading}>{title}</h2>
            <p className={componentStyles.emptyDescription}>{body}</p>
            {kind === 'none' && onPractice ? (
                <Button size='compact' onClick={onPractice}>
                    {L('startPractice')}
                </Button>
            ) : null}
            {kind !== 'none' && onReset ? (
                <Button size='compact' variant='secondary' onClick={onReset}>
                    {L('resetFilters')}
                </Button>
            ) : null}
        </div>
    );
}
