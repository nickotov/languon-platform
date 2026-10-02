import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import type { ConflictKind } from '../../hooks/use-practice-session';

export function ConflictNotice({
    kind,
    busy,
    onReload,
    onDismiss,
}: {
    kind: ConflictKind;
    busy: boolean;
    onReload(): void;
    onDismiss(): void;
}) {
    const { t } = useI18n();
    const title = t(
        kind === 'content'
            ? 'training.contentConflict'
            : kind === 'operation'
              ? 'training.operationConflict'
              : 'training.undoConflict',
    );
    const body = t(
        kind === 'content'
            ? 'training.contentConflictHelp'
            : kind === 'operation'
              ? 'training.operationConflictHelp'
              : 'training.undoConflictHelp',
    );
    const action = kind === 'content' ? onReload : onDismiss;
    const label = t(
        kind === 'content'
            ? 'training.loadUpdated'
            : kind === 'operation'
              ? 'training.rateAgain'
              : 'training.ok',
    );
    return (
        <InlineAlert
            tone='warning'
            title={title}
            actions={
                <Button size='compact' onClick={action} loading={busy}>
                    {label}
                </Button>
            }
        >
            {body}
        </InlineAlert>
    );
}
