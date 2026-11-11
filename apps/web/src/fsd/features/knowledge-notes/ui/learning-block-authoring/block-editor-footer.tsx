'use client';
import { Button, DialogActions } from '@/fsd/shared/ui';
import type { BlockAuthoringLabels } from './block-labels';
import styles from './learning-block-authoring.module.css';
export function BlockEditorFooter({
    confirming,
    dirty,
    formId,
    labels,
    keepEditing,
    onClose,
    requestClose,
    onApply,
}: {
    confirming: boolean;
    dirty: boolean;
    formId?: string;
    labels: BlockAuthoringLabels;
    keepEditing(): void;
    onClose(): void;
    requestClose(): void;
    onApply?: () => void;
}) {
    return confirming ? (
        <div
            className={styles.footer}
            role='alertdialog'
            aria-label={labels.field('Discard changes?')}
        >
            <div className={styles.footerNote}>
                <strong>{labels.field('Discard changes?')}</strong>
                <p>
                    {labels.field(
                        'Your changes have not been applied to the sheet.',
                    )}
                </p>
            </div>
            <DialogActions className={styles.footerActions}>
                <Button
                    type='button'
                    size='compact'
                    variant='secondary'
                    onClick={keepEditing}
                    autoFocus
                >
                    {labels.field('Continue')}
                </Button>
                <Button
                    type='button'
                    size='compact'
                    variant='danger'
                    onClick={onClose}
                >
                    {labels.field('Discard')}
                </Button>
            </DialogActions>
        </div>
    ) : (
        <div className={styles.footer}>
            <p className={styles.footerNote}>
                {labels.field(
                    dirty
                        ? 'Changes stay in this editor until you apply them.'
                        : 'No changes yet.',
                )}
            </p>
            <DialogActions className={styles.footerActions}>
                <Button
                    type='button'
                    size='compact'
                    variant='ghost'
                    onClick={requestClose}
                >
                    {labels.cancel}
                </Button>
                <Button
                    type={onApply ? 'button' : 'submit'}
                    onClick={onApply}
                    form={formId}
                    size='compact'
                    disabled={!dirty}
                >
                    {labels.apply}
                </Button>
            </DialogActions>
        </div>
    );
}
