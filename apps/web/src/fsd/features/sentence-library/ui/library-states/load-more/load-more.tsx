import componentStyles from '../../styles/library-states-common.module.css';
import { Loader2Icon } from 'lucide-react';
import { Button } from '@/fsd/shared/ui';
import { InlineAlert } from '@/fsd/shared/ui';
import { useInterfaceText } from '../../../hooks/use-interface-text';

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
