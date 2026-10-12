import React from 'react';
import componentStyles from './library-states.module.css';
import {
    EyeOffIcon,
    FilterXIcon,
    Loader2Icon,
    MessageSquareTextIcon,
} from 'lucide-react';
import { Button } from '@/fsd/shared/ui';
import { InlineAlert } from '@/fsd/shared/ui';
import { Skeleton } from '@/fsd/shared/ui';
import { useInterfaceText } from '../../hooks/use-interface-text';

export function LibrarySkeleton({ rows = 5 }: { rows?: number }) {
    const { L } = useInterfaceText();
    return (
        <div
            role='status'
            aria-label={L('loading')}
            className={componentStyles.root}
        >
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className={componentStyles.skeletonRow}>
                    <Skeleton variant='rect' width={20} height={20} />
                    <div className={componentStyles.skeletonContent}>
                        <Skeleton
                            variant='rect'
                            width={`${70 - (i % 3) * 12}%`}
                            height='1.1rem'
                        />
                        <Skeleton variant='rect' width='40%' height='0.85rem' />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function LibraryLoadError({ onRetry }: { onRetry: () => void }) {
    const { L } = useInterfaceText();
    return (
        <InlineAlert
            tone='error'
            title={L('loadFailedTitle')}
            actions={
                <Button size='compact' variant='secondary' onClick={onRetry}>
                    {L('retry')}
                </Button>
            }
        >
            {L('loadFailedBody')}
        </InlineAlert>
    );
}

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
    const Icon =
        kind === 'none'
            ? MessageSquareTextIcon
            : kind === 'archive-empty'
              ? EyeOffIcon
              : FilterXIcon;
    const title =
        kind === 'none'
            ? L('emptyTitle')
            : kind === 'archive-empty'
              ? L('archiveEmptyTitle')
              : L('noResultsTitle');
    const body =
        kind === 'none'
            ? L('emptyBody')
            : kind === 'archive-empty'
              ? L('archiveEmptyBody')
              : L('noResultsBody');
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

export function LoadMore({
    shown,
    total,
    status,
    onLoad,
}: {
    shown: number;
    total: number;
    status: 'idle' | 'loading' | 'error';
    onLoad: () => void;
}) {
    const { L } = useInterfaceText();
    return (
        <div className={componentStyles.root}>
            {status === 'error' ? (
                <InlineAlert
                    tone='warning'
                    title={L('nextPageFailed')}
                    actions={
                        <Button
                            size='compact'
                            variant='secondary'
                            onClick={onLoad}
                        >
                            {L('retry')}
                        </Button>
                    }
                />
            ) : null}
            {status === 'loading' ? (
                <div role='status' className={componentStyles.loadingMore}>
                    <Loader2Icon
                        aria-hidden
                        className={componentStyles.spinner}
                    />
                    {L('loadingMore')}
                </div>
            ) : null}
            <div className={componentStyles.pagination}>
                <p className={componentStyles.paginationHelp}>
                    {L('shownOf', { shown, total })}
                </p>
                {shown < total && status === 'idle' ? (
                    <Button variant='secondary' onClick={onLoad}>
                        {L('showMore')}
                    </Button>
                ) : null}
                {shown >= total ? (
                    <p className={componentStyles.secondaryHelp}>
                        {L('allShown')}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
