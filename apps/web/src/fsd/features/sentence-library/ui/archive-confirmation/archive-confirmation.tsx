import {
    Button,
    Dialog,
    DialogActions,
    Badge,
    InlineAlert,
} from '@/fsd/shared/ui';
import { useInterfaceText } from '../../hooks/use-interface-text';
import { LibraryApiError } from '../../api/library-api';
import type { LibraryController } from '../../hooks/use-sentence-library';
import type { LibraryDictionary } from '../../types';
export function ArchiveConfirmation({
    controller: c,
    dictionary,
}: {
    controller: LibraryController;
    dictionary: LibraryDictionary;
}) {
    const { L, direction } = useInterfaceText();
    const value = c.confirmation;
    const conflict =
        c.error instanceof LibraryApiError && c.error.status === 409;
    const tooMany =
        c.error instanceof LibraryApiError &&
        c.error.code === 'capacity_unavailable';
    const rateLimited =
        c.error instanceof LibraryApiError && c.error.code === 'rate_limited';
    if (!value && !c.error) return null;
    const operation = value?.operation ?? 'archive';
    const count = value?.count ?? 0;
    let title = L('failTitle');
    if (tooMany) title = L('tooManyTitle');
    else if (rateLimited) title = L('limitTitle');
    else if (conflict) title = L('staleTitle');
    else if (value)
        title = L(
            operation === 'archive'
                ? 'confirmRemoveTitle'
                : 'confirmRestoreTitle',
            { n: count },
        );
    const filters = value?.filters ?? c.filters;
    const mine = {
        active: L('mineAvailable'),
        archived: L('mineArchived'),
        all: L('mineAll'),
    }[filters.personalArchive ?? 'active'];
    const current = {
        all: L('curAll'),
        current: L('curCurrent'),
        outdated: L('curOutdated'),
    }[filters.contentState ?? 'all'];
    const global = {
        active: L('globActive'),
        archived: L('globArchived'),
        all: L('globAll'),
    }[filters.globalArchive ?? 'active'];
    const reversed = filters.direction === 'target-to-source';
    const label = reversed
        ? direction(dictionary.targetLanguage, dictionary.sourceLanguage)
        : direction(dictionary.sourceLanguage, dictionary.targetLanguage);
    function confirm() {
        void c.confirm();
    }
    const footer = (
        <DialogActions>
            <Button
                variant='secondary'
                disabled={c.pending}
                onClick={c.closeConfirmation}
            >
                {L('cancel')}
            </Button>
            {value ? (
                <Button
                    disabled={count === 0}
                    loading={c.pending}
                    onClick={confirm}
                >
                    {L(operation === 'archive' ? 'removeMine' : 'restore')}
                </Button>
            ) : conflict ? (
                <Button onClick={c.closeConfirmation}>{L('reconfirm')}</Button>
            ) : null}
        </DialogActions>
    );
    return (
        <Dialog
            open
            title={title}
            onClose={c.closeConfirmation}
            dismissible={!c.pending}
            footer={footer}
            closeLabel={L('close')}
        >
            {value ? (
                <div className='space-y-4 text-sm'>
                    <div className='rounded-lg border border-border-default bg-background-subtle p-3'>
                        <p className='text-xs font-medium uppercase tracking-wide text-text-tertiary'>
                            {L('confirmScope')}
                        </p>
                        <p className='mt-1 font-medium text-text-primary'>
                            {L(
                                value.selection.type === 'all-matching'
                                    ? 'scopeAll'
                                    : 'scopeIds',
                            )}
                        </p>
                        <p className='mt-0.5 text-text-secondary'>
                            {dictionary.name}
                        </p>
                        <div className='mt-2 flex flex-wrap gap-1.5'>
                            <Badge size='sm' tone='info'>
                                {label}
                            </Badge>
                            <Badge size='sm'>
                                {L('filterMine')}: {mine}
                            </Badge>
                            <Badge size='sm'>
                                {L('filterCurrent')}: {current}
                            </Badge>
                            <Badge size='sm'>
                                {L('filterGlobal')}: {global}
                            </Badge>
                        </div>
                    </div>
                    <p className='text-text-secondary'>
                        {L(
                            operation === 'archive'
                                ? 'confirmRemoveBody'
                                : 'confirmRestoreBody',
                        )}
                    </p>
                </div>
            ) : null}
            {c.error ? (
                <InlineAlert
                    tone={
                        conflict
                            ? 'warning'
                            : tooMany || rateLimited
                              ? 'info'
                              : 'error'
                    }
                    title={title}
                >
                    {L(
                        conflict
                            ? 'staleBody'
                            : tooMany
                              ? 'tooManyBody'
                              : rateLimited
                                ? 'limitBody'
                                : 'failBody',
                    )}
                </InlineAlert>
            ) : null}
        </Dialog>
    );
}
