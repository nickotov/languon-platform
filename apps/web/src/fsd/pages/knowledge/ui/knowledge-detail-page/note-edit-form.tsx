import { useRouter } from 'next/navigation';
import { KnowledgeNoteForm } from '@/fsd/features/knowledge-notes';
import { useI18n } from '@/fsd/shared/i18n';
import type { useDirtyNavigation } from '@/fsd/shared/lib/navigation/use-dirty-navigation';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import type { useKnowledgeNote } from '../../hooks/use-knowledge-note';
import styles from './knowledge-detail-page.module.css';

type Props = {
    state: ReturnType<typeof useKnowledgeNote>;
    navigation: ReturnType<typeof useDirtyNavigation>;
    valid: boolean;
    dirty: boolean;
    conflict: boolean;
    missing: boolean;
    onValidity(valid: boolean): void;
    onCompare(): void;
};

export function NoteEditForm({
    state,
    navigation,
    valid,
    dirty,
    conflict,
    missing,
    onValidity,
    onCompare,
}: Props) {
    const { t, href } = useI18n();
    const router = useRouter();
    const mutationError = state.save.error ?? state.saveNew.error;
    const error =
        mutationError && !conflict ? t('knowledge.saveError') : undefined;
    function change(content: NonNullable<typeof state.edit>['content']) {
        state.setEdit((edit) => (edit ? { ...edit, content } : null));
    }
    function cancel() {
        navigation.request(() => {
            state.setEdit(null);
            state.save.reset();
            state.saveNew.reset();
        });
    }
    function save() {
        if (state.edit) state.save.mutate(state.edit);
    }
    async function saveAsNew() {
        if (!state.edit || !valid) return;
        try {
            const saved = await state.saveNew.mutateAsync(state.edit.content);
            navigation.setDirty(false);
            router.push(href(`/knowledge/${saved.id}`));
        } catch {
            /* Mutation retains the local draft and exposes the failure. */
        }
    }
    if (!state.edit) return null;
    return (
        <>
            {conflict && (
                <InlineAlert
                    tone='warning'
                    actions={
                        <Button variant='secondary' onClick={onCompare}>
                            {t('knowledge.compare')}
                        </Button>
                    }
                >
                    {t('knowledge.conflict')}
                </InlineAlert>
            )}
            <KnowledgeNoteForm
                value={state.edit.content}
                onChange={change}
                disabled={state.busy}
                onValidityChange={onValidity}
                error={error}
            />
            <div className={styles.saveActions}>
                <Button
                    variant='secondary'
                    disabled={state.busy}
                    onClick={cancel}
                >
                    {t('knowledge.cancel')}
                </Button>
                {(conflict || missing) && (
                    <Button
                        disabled={state.busy || !valid}
                        loading={state.saveNew.isPending}
                        onClick={saveAsNew}
                    >
                        {t('knowledge.saveAsNew')}
                    </Button>
                )}
                {!missing && (
                    <Button
                        disabled={state.busy || !valid || !dirty || conflict}
                        loading={state.save.isPending}
                        onClick={save}
                    >
                        {t(
                            state.save.isPending
                                ? 'knowledge.saving'
                                : 'knowledge.save',
                        )}
                    </Button>
                )}
            </div>
        </>
    );
}
