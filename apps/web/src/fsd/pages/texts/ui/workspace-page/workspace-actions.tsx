import { Pencil, Save } from 'lucide-react';
import { Button } from '@/fsd/shared/ui';
import type { TextWorkspace } from '../../hooks/use-text-workspace';
import { useWorkspaceCopy } from './workspace-copy';
import styles from './workspace-page.module.css';

export function WorkspaceActions({
    ws,
    onDiscard,
    onCancelEdit,
}: {
    ws: TextWorkspace;
    onDiscard(): void;
    onCancelEdit(): void;
}) {
    const { copy } = useWorkspaceCopy();

    function save() {
        void ws.save();
    }

    if (ws.aiActive ?? ws.translation.active) return null;
    if (ws.proposal)
        return (
            <div className={styles.actions}>
                <Button
                    variant='secondary'
                    onClick={onDiscard}
                    disabled={ws.saving}
                >
                    {ws.document?.alignment
                        ? copy('discard')
                        : copy('editSource')}
                </Button>
                <Button
                    desktopIconOnly
                    onClick={save}
                    loading={ws.saving}
                    disabled={ws.previewExpired || ws.requiresFolderConsent}
                    leadingIcon={<Save />}
                >
                    {ws.document?.alignment ? copy('saveNew') : copy('save')}
                </Button>
            </div>
        );
    if (ws.mode === 'read')
        return (
            <Button
                desktopIconOnly
                variant='secondary'
                onClick={ws.startEdit}
                leadingIcon={<Pencil />}
            >
                {copy('edit')}
            </Button>
        );
    if (ws.mode === 'edit')
        return (
            <div className={styles.actions}>
                <Button
                    variant='secondary'
                    onClick={onCancelEdit}
                    disabled={ws.saving}
                >
                    {copy('cancelEdit')}
                </Button>
                <Button
                    desktopIconOnly
                    onClick={save}
                    loading={ws.saving}
                    leadingIcon={<Save />}
                >
                    {copy('saveChanges')}
                </Button>
            </div>
        );

    return (
        <div className={styles.actions}>
            <Button
                desktopIconOnly
                variant='secondary'
                onClick={save}
                loading={ws.saving}
                disabled={
                    ws.input.sourceLanguage === 'auto' ||
                    ws.requiresFolderConsent
                }
                leadingIcon={<Save />}
            >
                {copy('saveDraft')}
            </Button>
        </div>
    );
}
