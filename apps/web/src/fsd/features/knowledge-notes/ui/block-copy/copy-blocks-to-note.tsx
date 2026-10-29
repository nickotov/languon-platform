'use client';
import { useState, type ChangeEvent } from 'react';
import type { LearningBlock } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Dialog, InlineAlert } from '@/fsd/shared/ui';
import type { KnowledgeBlockCopyContext } from '../../api/block-copy-api';
import type { CopyDestination } from '../../types';
import { useBlockCopy } from '../../hooks/use-block-copy';
import { localizedBlockLabels } from '../learning-block-authoring/block-locales';
import { CopyDestinationPicker } from './copy-destination-picker';
import { blockCopyLabels } from './block-copy-labels';
import styles from './block-copy.module.css';
export function CopyBlocksToNote({
    context,
    compact = false,
    blocks,
    disabled = false,
}: {
    compact?: boolean;
    context: KnowledgeBlockCopyContext;
    blocks: LearningBlock[];
    disabled?: boolean;
}) {
    const { locale } = useI18n();
    const labels = blockCopyLabels(locale);
    const [open, setOpen] = useState(false);
    function show() {
        setOpen(true);
    }
    function close() {
        setOpen(false);
    }
    return (
        <>
            <Button
                type='button'
                variant={compact ? 'ghost' : 'secondary'}
                size={compact ? 'small' : 'default'}
                onClick={show}
                disabled={disabled || blocks.length === 0}
            >
                {labels.title}
            </Button>
            {open && (
                <BlockCopyDialog
                    context={context}
                    blocks={blocks}
                    onClose={close}
                />
            )}
        </>
    );
}
export function BlockCopyDialog({
    context,
    blocks,
    onClose,
    initialSelection,
    initialDestination,
}: {
    context: KnowledgeBlockCopyContext;
    blocks: LearningBlock[];
    onClose(): void;
    initialSelection?: string[] | undefined;
    initialDestination?: CopyDestination | undefined;
}) {
    const { locale } = useI18n();
    const labels = blockCopyLabels(locale);
    const viewLabels = localizedBlockLabels(locale).view;
    const copy = useBlockCopy(context, initialSelection, initialDestination);
    function close() {
        if (!copy.busy) onClose();
    }
    function toggle(event: ChangeEvent<HTMLInputElement>) {
        const id = event.target.value;
        copy.chooseBlocks(
            event.target.checked
                ? [...copy.selected, id]
                : copy.selected.filter((value) => value !== id),
        );
    }
    const previewUnavailable =
        copy.busy ||
        copy.selected.length === 0 ||
        copy.selected.length > 50 ||
        !copy.destination;
    return (
        <Dialog
            open
            title={labels.title}
            closeLabel={labels.cancel}
            onClose={close}
            dismissible={!copy.busy}
            size='large'
        >
            <div className={styles.form}>
                <fieldset className={styles.selection} disabled={copy.busy}>
                    <legend>{labels.select}</legend>
                    {blocks.map((block) => (
                        <label key={block.id}>
                            <input
                                type='checkbox'
                                value={block.id}
                                checked={copy.selected.includes(block.id)}
                                disabled={
                                    !copy.selected.includes(block.id) &&
                                    copy.selected.length >= 50
                                }
                                onChange={toggle}
                            />
                            {block.title ?? viewLabels.kinds[block.type]}
                        </label>
                    ))}
                </fieldset>
                <CopyDestinationPicker
                    request={context.requestWithSession}
                    labels={labels}
                    onSelect={copy.chooseDestination}
                    disabled={copy.busy}
                    initialDestination={initialDestination}
                />
                <Button
                    type='button'
                    variant='secondary'
                    onClick={copy.preview}
                    disabled={previewUnavailable}
                >
                    {labels.preview}
                </Button>
                {copy.plan && (
                    <div className={styles.preview}>
                        <p>
                            {labels.selectedCount}:{' '}
                            {copy.plan.result.selectedCount}
                        </p>
                        <p>
                            {labels.dependencies}:{' '}
                            {copy.plan.result.dependencyCount ?? '—'}
                        </p>
                        <p>
                            {labels.media}: {copy.plan.result.mediaCount ?? '—'}
                        </p>
                        <Button
                            type='button'
                            onClick={copy.apply}
                            loading={copy.busy}
                        >
                            {labels.apply}
                        </Button>
                    </div>
                )}
                {copy.copied && <p role='status'>{labels.copied}</p>}
                {copy.error && (
                    <InlineAlert tone='error'>{labels.error}</InlineAlert>
                )}
            </div>
        </Dialog>
    );
}
