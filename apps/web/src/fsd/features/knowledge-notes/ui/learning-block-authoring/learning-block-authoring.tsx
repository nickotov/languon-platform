'use client';

import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { Transaction } from '@tiptap/pm/state';
import { type LearningBlock } from '@languon/contracts';
import { Dialog, InlineAlert } from '@/fsd/shared/ui';
import { blocks } from '../../lib/positioned-learning-blocks';
import { normalizeEditorDocument } from '../../lib/editor-document';
import type { BlockKind } from '../../lib/learning-block-form';
import type { KnowledgeBlockCopyContext } from '../../api/block-copy-api';
import {
    CopyBlocksToNote,
    BlockCopyDialog,
} from '../block-copy/copy-blocks-to-note';
import type { KnowledgeLibraryContext } from '../../api/library-copy-api';
import { InsertLibraryBlock } from '../library-copy/insert-library-block';
import { AudioBlockUpload, type UploadBlockAudio } from './audio-block-upload';
import { BlockActions } from './block-actions';
import { BlockInsertMenu } from './block-insert-menu';
import { BlockFormDialog } from './block-form-dialog';
import {
    defaultAuthoringLabels,
    type BlockAuthoringLabels,
} from './block-labels';
import styles from './learning-block-authoring.module.css';

export function LearningBlockAuthoring({
    editor,
    disabled,
    labels = defaultAuthoringLabels,
    uploadAudio,
    library,
    blockCopy,
}: {
    editor: Editor;
    disabled: boolean;
    labels?: BlockAuthoringLabels;
    uploadAudio?: UploadBlockAudio | undefined;
    library?: KnowledgeLibraryContext | undefined;
    blockCopy?: KnowledgeBlockCopyContext | undefined;
}) {
    const [serverDuplicate, setServerDuplicate] =
        useState<LearningBlock | null>(null);
    const [items, setItems] = useState(() => blocks(editor));
    const [audioPending, setAudioPending] = useState(false);
    const [editing, setEditing] = useState<{
        kind: BlockKind;
        block?: LearningBlock;
        existing?: boolean;
    } | null>(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        setItems(blocks(editor));
        function refresh({ transaction }: { transaction: Transaction }) {
            if (transaction.docChanged) setItems(blocks(editor));
        }
        editor.on('transaction', refresh);
        return () => {
            editor.off('transaction', refresh);
        };
    }, [editor]);
    function add(kind: BlockKind) {
        if (disabled) return;
        if (kind === 'audio') setAudioPending(true);
        else setEditing({ kind });
    }
    function closeAudio() {
        setAudioPending(false);
    }
    function close() {
        setEditing(null);
    }
    function apply(block: LearningBlock) {
        if (disabled) return false;
        const previous = editing?.existing ? editing.block : undefined;
        const found = previous
            ? blocks(editor).find((item) => item.block.id === previous.id)
            : undefined;
        if (
            previous &&
            (!found || JSON.stringify(found.block) !== JSON.stringify(previous))
        ) {
            setError(true);
            return false;
        }
        const node = editor.schema.nodes.learningBlock!.create({ block });
        const transaction = editor.state.tr;
        if (found)
            transaction.replaceWith(
                found.position,
                found.position + found.size,
                node,
            );
        else transaction.insert(transaction.doc.content.size, node);
        try {
            normalizeEditorDocument(transaction.doc.toJSON());
            editor.view.dispatch(transaction);
            close();
            setError(false);
            return true;
        } catch {
            setError(true);
            return false;
        }
    }
    function insert(block: LearningBlock) {
        if (disabled) return false;
        const node = editor.schema.nodes.learningBlock!.create({ block });
        const transaction = editor.state.tr.insert(
            editor.state.doc.content.size,
            node,
        );
        try {
            normalizeEditorDocument(transaction.doc.toJSON());
            editor.view.dispatch(transaction);
            setError(false);
            return true;
        } catch {
            setError(true);
            return false;
        }
    }
    function edit(block: LearningBlock) {
        setEditing({ kind: block.type, block, existing: true });
    }
    function uploaded(block: Extract<LearningBlock, { type: 'audio' }>) {
        setAudioPending(false);
        setEditing({ kind: 'audio', block });
    }
    function duplicateOnServer(block: LearningBlock) {
        setServerDuplicate(block);
    }
    function closeDuplicate() {
        setServerDuplicate(null);
    }
    const duplicateDestination =
        blockCopy?.source.kind === 'owned-working'
            ? {
                  noteId: blockCopy.source.noteId,
                  branchId: blockCopy.source.branchId,
              }
            : undefined;
    const duplicateSelection = serverDuplicate ? [serverDuplicate.id] : [];
    const sourceBlocks = items.map((item) => item.block);
    return (
        <div className={styles.root}>
            <div className={styles.actions}>
                <BlockInsertMenu
                    labels={labels}
                    disabled={disabled}
                    onChoose={add}
                />
                {library && (
                    <InsertLibraryBlock
                        context={library}
                        disabled={disabled}
                        onInsert={insert}
                        compact
                    />
                )}
                {blockCopy && sourceBlocks.length > 0 && (
                    <CopyBlocksToNote
                        context={blockCopy}
                        blocks={sourceBlocks}
                        disabled={disabled}
                        compact
                    />
                )}
            </div>
            {serverDuplicate && blockCopy && (
                <BlockCopyDialog
                    context={blockCopy}
                    blocks={sourceBlocks}
                    initialSelection={duplicateSelection}
                    initialDestination={duplicateDestination}
                    onClose={closeDuplicate}
                />
            )}
            {audioPending && (
                <Dialog
                    open
                    title={labels.view.kinds.audio}
                    closeLabel={labels.cancel}
                    onClose={closeAudio}
                >
                    {uploadAudio ? (
                        <AudioBlockUpload
                            upload={uploadAudio}
                            disabled={disabled}
                            labels={labels}
                            onReady={uploaded}
                        />
                    ) : (
                        <InlineAlert>{labels.audioPending}</InlineAlert>
                    )}
                </Dialog>
            )}
            {items.length > 0 && (
                <details className={styles.management}>
                    <summary>
                        {labels.field('Manage blocks')}{' '}
                        <span className={styles.count}>{items.length}</span>
                    </summary>
                    <div className={styles.blockList}>
                        {items.map((item, index) => (
                            <BlockActions
                                key={item.block.id}
                                item={item}
                                index={index}
                                total={items.length}
                                editor={editor}
                                labels={labels}
                                disabled={disabled}
                                onEdit={edit}
                                onServerDuplicate={
                                    blockCopy ? duplicateOnServer : undefined
                                }
                            />
                        ))}
                    </div>
                </details>
            )}
            {error && <InlineAlert tone='error'>{labels.error}</InlineAlert>}
            {editing !== null && (
                <BlockFormDialog
                    key={editing.block?.id ?? editing.kind}
                    kind={editing.kind}
                    block={editing.block}
                    labels={labels}
                    onClose={close}
                    onApply={apply}
                    sources={sourceBlocks}
                />
            )}
        </div>
    );
}
