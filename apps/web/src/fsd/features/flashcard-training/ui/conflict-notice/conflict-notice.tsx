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

    function resolveTitle() {
        if (kind === 'content') {
            return 'training.contentConflict' as const;
        }

        if (kind === 'operation') {
            return 'training.operationConflict' as const;
        }

        return 'training.undoConflict' as const;
    }

    const title = t(resolveTitle());

    function resolveBody() {
        if (kind === 'content') {
            return 'training.contentConflictHelp' as const;
        }

        if (kind === 'operation') {
            return 'training.operationConflictHelp' as const;
        }

        return 'training.undoConflictHelp' as const;
    }

    const body = t(resolveBody());

    const action = kind === 'content' ? onReload : onDismiss;

    function resolveLabel() {
        if (kind === 'content') {
            return 'training.loadUpdated' as const;
        }

        if (kind === 'operation') {
            return 'training.rateAgain' as const;
        }

        return 'training.ok' as const;
    }

    const label = t(resolveLabel());

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
