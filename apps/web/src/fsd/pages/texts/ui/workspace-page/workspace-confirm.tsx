import { Button, Dialog, DialogActions } from '@/fsd/shared/ui';
import type { TextWorkspace } from '../../hooks/use-text-workspace';
import { workspaceValid } from '../../lib/workspace-content';
import { useWorkspaceCopy } from './workspace-copy';
import styles from './workspace-page.module.css';

export type WorkspaceConfirmation =
    'close' | 'retranslate' | 'discard' | 'cancel-edit' | 'conflict' | null;

export function WorkspaceConfirm({
    kind,
    ws,
    onClose,
    onLeave,
}: {
    kind: WorkspaceConfirmation;
    ws: TextWorkspace;
    onClose(): void;
    onLeave(): void;
}) {
    const { copy } = useWorkspaceCopy();
    const running = ws.aiActive ?? ws.translation.active;
    let title = copy('discardTitle');
    let description = copy('discardHint');
    let confirm = copy('discard');
    if (kind === 'close') {
        title = running ? copy('stopTitle') : copy('leaveTitle');
        description = running ? copy('stopHint') : copy('leaveHint');
        confirm = running ? copy('stopClose') : copy('discardClose');
    }

    if (kind === 'retranslate') {
        title = copy('retranslateTitle');
        description = copy('retranslateHint');
        confirm = copy('retranslate');
    }

    if (kind === 'conflict') {
        title = copy('review');
        description = copy('conflictHint');
        confirm = copy('keepMine');
    }
    async function accept() {
        if (kind === 'close') {
            if (running) {
                try {
                    if (ws.cancelAi) ws.cancelAi();
                    else await ws.translation.cancel();
                } catch {
                    return;
                }
            }
            onLeave();
            return;
        }
        if (kind === 'retranslate') {
            onClose();
            await ws.translate();
            return;
        }
        if (kind === 'conflict') {
            if (await ws.save(true)) onClose();
            return;
        }
        if (kind === 'cancel-edit') ws.cancelEdit();
        else ws.discardProposal();
        onClose();
    }
    async function saveClose() {
        if (await ws.save()) onLeave();
    }

    function newer() {
        ws.useNewer();
        onClose();
    }

    const canSave =
        kind === 'close' &&
        !running &&
        !ws.previewExpired &&
        (ws.proposal ||
            (ws.mode === 'edit'
                ? ws.pairs.every(
                      (pair) => pair.source.trim() && pair.translation.trim(),
                  )
                : ws.input.sourceLanguage !== 'auto' &&
                  workspaceValid(ws.input)));
    const mine = ws.pairs;

    return (
        <Dialog
            open={kind !== null}
            onClose={onClose}
            title={title}
            description={description}
            size={kind === 'conflict' ? 'lg' : 'sm'}
            dismissible={!ws.saving}
            footer={
                <DialogActions>
                    <Button
                        variant='secondary'
                        onClick={onClose}
                        disabled={ws.saving}
                    >
                        {kind === 'close' ? copy('keep') : copy('cancel')}
                    </Button>
                    {kind === 'conflict' && (
                        <Button variant='secondary' onClick={newer}>
                            {copy('useNewer')}
                        </Button>
                    )}
                    <Button
                        variant={
                            kind === 'retranslate' || kind === 'conflict'
                                ? 'primary'
                                : 'danger'
                        }
                        onClick={accept}
                        loading={ws.saving}
                        disabled={kind === 'conflict' && Boolean(ws.proposal)}
                    >
                        {confirm}
                    </Button>
                    {canSave && (
                        <Button onClick={saveClose} loading={ws.saving}>
                            {copy('saveClose')}
                        </Button>
                    )}
                </DialogActions>
            }
        >
            {kind === 'conflict' && !ws.conflict?.alignment && (
                <div className={styles.pairColumns}>
                    <section>
                        <h3>{copy('newer')}</h3>
                        <p>{ws.conflict?.title}</p>
                        <p>{ws.conflict?.sourceText}</p>
                    </section>
                    <section>
                        <h3>{copy('mine')}</h3>
                        <p>{ws.input.title}</p>
                        <p>{ws.input.sourceText}</p>
                    </section>
                </div>
            )}
            {kind === 'conflict' && (
                <div className={styles.conflicts}>
                    {ws.conflict?.alignment?.source.map((segment, index) => (
                        <section key={segment.pairId}>
                            <h3>
                                {copy('pair')} {index + 1}
                            </h3>
                            <div className={styles.pairColumns}>
                                <div>
                                    <h4>{copy('newer')}</h4>
                                    <p>{segment.text}</p>
                                    <p>
                                        {
                                            ws.conflict?.alignment?.translation[
                                                index
                                            ]?.text
                                        }
                                    </p>
                                </div>
                                <div>
                                    <h4>{copy('mine')}</h4>
                                    <p>
                                        {
                                            mine.find(
                                                (pair) =>
                                                    pair.pairId ===
                                                    segment.pairId,
                                            )?.source
                                        }
                                    </p>
                                    <p>
                                        {
                                            mine.find(
                                                (pair) =>
                                                    pair.pairId ===
                                                    segment.pairId,
                                            )?.translation
                                        }
                                    </p>
                                </div>
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </Dialog>
    );
}
