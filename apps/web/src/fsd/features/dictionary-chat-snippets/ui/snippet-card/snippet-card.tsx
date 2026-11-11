import type { DictionaryChatSnippet } from '@languon/contracts';
import { dictionaryErrorMessage } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Checkbox, Dialog, InlineAlert } from '@/fsd/shared/ui';
import { useSnippetApplication } from '../../hooks/use-snippet-application';
import { snippetCopy, snippetCount } from '../../lib/snippet-copy';
import type { DictionarySnippetContext } from '../../types';
import { SnippetFields } from './snippet-fields';
import styles from './snippet-card.module.css';

export function DictionarySnippetCard({
    snippet,
    context,
    disabled = false,
    onApplying,
}: {
    snippet: DictionaryChatSnippet;
    context: DictionarySnippetContext;
    disabled?: boolean;
    onApplying(value: boolean): void;
}) {
    const { locale, t } = useI18n();
    const copy = snippetCopy(locale);
    const application = useSnippetApplication(snippet, context, onApplying);
    const busy = disabled || application.pending;
    const empty = application.selected.length === 0;
    const actionsDisabled = busy || empty;
    const selectedLabel = snippetCount(
        copy.selected,
        application.selected.length,
    );
    const allSelected = application.selected.length === snippet.cards.length;
    const mixedSelection = !allSelected && !empty;
    const error = application.error
        ? dictionaryErrorMessage(application.error, t)
        : null;
    const replacementDescription = snippetCount(
        copy.replaceDescription,
        application.replacement?.activeCardCount ?? 0,
    );

    function append() {
        application.requestApply('append');
    }

    function prepend() {
        application.requestApply('prepend');
    }

    function replace() {
        application.requestApply('replace');
    }

    return (
        <section
            className={styles.snippet}
            aria-label={snippet.title}
            data-dictionary-snippet={snippet.id}
        >
            <h3 className={styles.title}>{snippet.title}</h3>
            <p className={styles.help}>{copy.help}</p>
            <div className={styles.selection}>
                <Checkbox
                    checked={allSelected}
                    indeterminate={mixedSelection}
                    disabled={busy}
                    onChange={application.toggleAll}
                    label={copy.selectAll}
                />
                <span className={styles.help}>{selectedLabel}</span>
            </div>
            <ol className={styles.cards}>
                {snippet.cards.map((_, index) => (
                    <SnippetFields
                        key={index}
                        snippet={snippet}
                        index={index}
                        checked={application.selected.includes(index)}
                        disabled={busy}
                        onToggle={application.toggle}
                    />
                ))}
            </ol>
            <div className={styles.actions}>
                <Button
                    type='button'
                    size='small'
                    onClick={append}
                    disabled={actionsDisabled}
                >
                    {copy.append}
                </Button>
                <Button
                    type='button'
                    size='small'
                    variant='secondary'
                    onClick={prepend}
                    disabled={actionsDisabled}
                >
                    {copy.prepend}
                </Button>
                <Button
                    type='button'
                    size='small'
                    variant='danger'
                    onClick={replace}
                    disabled={actionsDisabled}
                >
                    {copy.replace}
                </Button>
            </div>
            {application.pending && (
                <p role='status' className={styles.help}>
                    {copy.pending}
                </p>
            )}
            {error && <InlineAlert tone='error'>{error}</InlineAlert>}
            {error && application.canRetry && (
                <Button
                    type='button'
                    variant='secondary'
                    onClick={application.retry}
                    disabled={busy}
                >
                    {copy.retry}
                </Button>
            )}
            <Dialog
                showCloseButton={false}
                open={Boolean(application.replacement)}
                onClose={application.cancelReplace}
                title={copy.replaceTitle}
                description={replacementDescription}
                closeLabel={copy.cancel}
                footer={
                    <>
                        <Button
                            type='button'
                            variant='secondary'
                            onClick={application.cancelReplace}
                        >
                            {copy.cancel}
                        </Button>
                        <Button
                            type='button'
                            variant='danger'
                            onClick={application.confirmReplace}
                            disabled={actionsDisabled}
                        >
                            {copy.replace}
                        </Button>
                    </>
                }
            />
        </section>
    );
}
