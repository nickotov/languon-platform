import { useId } from 'react';
import { BookOpen, ChevronRight } from 'lucide-react';
import type { DictionaryChatSnippet } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Checkbox, InlineAlert } from '@/fsd/shared/ui';
import { snippetCopy, snippetCount } from '../../../../lib/snippet-copy';
import { SnippetFields } from '../snippet-fields/snippet-fields';
import { SnippetActions } from '../snippet-actions/snippet-actions';
import styles from '../../../styles/snippet-card-common.module.css';

export type DictionarySnippetViewProps = {
    snippet: DictionaryChatSnippet;
    expanded: boolean;
    selected: readonly number[];
    disabled?: boolean;
    pending?: boolean;
    error?: string | null;
    canRetry?: boolean;
    onToggleExpanded(): void;
    onToggle(index: number): void;
    onToggleAll(): void;
    onAppend(): void;
    onPrepend(): void;
    onReplace(): void;
    onRetry(): void;
};

/** Account/network-free presentation shared by chat and the component catalog. */
export function DictionarySnippetView({
    snippet,
    expanded,
    selected,
    disabled = false,
    pending = false,
    error,
    canRetry = false,
    onToggleExpanded,
    onToggle,
    onToggleAll,
    onAppend,
    onPrepend,
    onReplace,
    onRetry,
}: DictionarySnippetViewProps) {
    const { locale } = useI18n();
    const copy = snippetCopy(locale);
    const panelId = useId();
    const summaryId = useId();
    const empty = selected.length === 0;
    const allSelected = selected.length === snippet.cards.length;
    const mixed = !allSelected && !empty;
    const actionsDisabled = disabled || pending || empty;
    const selectionDisabled = disabled || pending;
    const selectedLabel = snippetCount(copy.selected, selected.length);
    const countLabel = snippetCount(copy.cardCount, snippet.cards.length);
    const reviewLabel = `${copy.review}: ${snippet.title}`;
    const languageNames = new Intl.DisplayNames(locale, { type: 'language' });
    const sourceLanguage = languageNames.of(
        snippet.generationContext.sourceLanguage,
    );
    const targetLanguage = languageNames.of(
        snippet.generationContext.targetLanguage,
    );

    function collapseFromFooter() {
        onToggleExpanded();
        document.getElementById(summaryId)?.focus();
    }

    return (
        <section
            className={styles.snippet}
            aria-label={snippet.title}
            data-dictionary-snippet={snippet.id}
        >
            <h3 className={styles.heading}>
                <Button
                    type='button'
                    variant='ghost'
                    className={styles.summary}
                    id={summaryId}
                    aria-label={reviewLabel}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={onToggleExpanded}
                >
                    <BookOpen
                        aria-hidden='true'
                        className={styles.artifactIcon}
                    />
                    <span className={styles.summaryCopy}>
                        <span className={styles.title}>{snippet.title}</span>
                        <span className={styles.metadata}>
                            <span>
                                {sourceLanguage} → {targetLanguage}
                            </span>
                            <span>{countLabel}</span>
                        </span>
                    </span>
                    <ChevronRight
                        aria-hidden='true'
                        className={styles.chevron}
                        data-expanded={expanded}
                    />
                </Button>
            </h3>
            <div
                id={panelId}
                className={styles.disclosure}
                data-expanded={expanded}
                aria-hidden={!expanded}
                inert={!expanded}
            >
                <div className={styles.disclosureInner}>
                    <div className={styles.review}>
                        <div className={styles.toolbar}>
                            <div className={styles.selection}>
                                <Checkbox
                                    checked={allSelected}
                                    indeterminate={mixed}
                                    disabled={selectionDisabled}
                                    onChange={onToggleAll}
                                    label={copy.selectAll}
                                />
                                <span className={styles.help}>
                                    {selectedLabel}
                                </span>
                            </div>
                            <SnippetActions
                                position='top'
                                disabled={actionsDisabled}
                                onAppend={onAppend}
                                onPrepend={onPrepend}
                                onReplace={onReplace}
                            />
                            <p className={styles.help}>{copy.help}</p>
                        </div>
                        <ol
                            className={styles.cards}
                            aria-label={copy.title}
                            tabIndex={0}
                            data-dictionary-snippet-list
                        >
                            {snippet.cards.map((_, index) => (
                                <SnippetFields
                                    key={index}
                                    snippet={snippet}
                                    index={index}
                                    checked={selected.includes(index)}
                                    disabled={selectionDisabled}
                                    onToggle={onToggle}
                                />
                            ))}
                        </ol>
                        <div className={styles.footer}>
                            <div className={styles.footerSummary}>
                                <span className={styles.help}>
                                    {selectedLabel}
                                </span>
                                <Button
                                    type='button'
                                    variant='ghost'
                                    size='small'
                                    onClick={collapseFromFooter}
                                >
                                    {copy.collapse}
                                </Button>
                            </div>
                            <SnippetActions
                                position='bottom'
                                disabled={actionsDisabled}
                                onAppend={onAppend}
                                onPrepend={onPrepend}
                                onReplace={onReplace}
                            />
                        </div>
                    </div>
                </div>
            </div>
            {pending && (
                <p role='status' className={styles.notice}>
                    {copy.pending}
                </p>
            )}
            {error && (
                <div className={styles.notice}>
                    <InlineAlert tone='error'>{error}</InlineAlert>
                </div>
            )}
            {error && canRetry && (
                <div className={styles.notice}>
                    <Button
                        type='button'
                        variant='secondary'
                        onClick={onRetry}
                        disabled={selectionDisabled}
                    >
                        {copy.retry}
                    </Button>
                </div>
            )}
        </section>
    );
}
