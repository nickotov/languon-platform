import { Button } from '@/fsd/shared/ui';
import { InlineAlert } from '@/fsd/shared/ui';
import { useInterfaceText } from '../../../hooks/use-interface-text';

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
