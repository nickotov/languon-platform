import {
    Button,
    Dialog,
    DialogActions,
    Badge,
    InlineAlert,
} from '@/fsd/shared/ui';
import componentStyles from './archive-confirmation.module.css';
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
                <div className={componentStyles.content}>
                    <div className={componentStyles.preview}>
                        <p className={componentStyles.previewLabel}>
                            {L('confirmScope')}
                        </p>
                        <p className={componentStyles.dictionaryName}>
                            {L(
                                value.selection.type === 'all-matching'
                                    ? 'scopeAll'
                                    : 'scopeIds',
                            )}
                        </p>
                        <p className={componentStyles.direction}>
                            {dictionary.name}
                        </p>
                        <div className={componentStyles.badges}>
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
                    <p className={componentStyles.help}>
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
