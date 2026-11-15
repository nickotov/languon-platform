import { FileText } from 'lucide-react';
import { CommandMenu, CommandMenuItem, LoadingState } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { useWorkspaceReferencePicker } from '../../../../hooks/use-workspace-reference-picker';
import { promptCopy } from '../../../../lib/prompt-copy';
import { referencePickerCopy } from './reference-picker-copy';
import type { WorkspaceReferencePickerProps } from './types';
import styles from '../../../styles/contextual-assistant-composer-common.module.css';
import menuStyles from '../../../styles/contextual-assistant-prompt-common.module.css';

export function WorkspaceReferencePicker(props: WorkspaceReferencePickerProps) {
    const { locale } = useI18n();
    const copy = referencePickerCopy(locale);
    const state = useWorkspaceReferencePicker(props);
    const title = state.selectedId
        ? (state.reference?.title ?? copy.source)
        : promptCopy(locale).texts;
    const sourceExcerpt =
        Array.from(state.passage).slice(0, 200).join('') +
        (state.passage.length > 200 ? '…' : '');
    const translationExcerpt =
        Array.from(state.translation).slice(0, 200).join('') +
        (state.translation.length > 200 ? '…' : '');
    const goBack = state.selectedId ? state.back : props.onBack;
    const backLabel = state.selectedId ? copy.back : promptCopy(locale).back;

    return (
        <section role='region' aria-label={copy.search}>
            <CommandMenu
                title={title}
                closeLabel={copy.close}
                onClose={props.onClose}
                backLabel={backLabel}
                onBack={goBack}
                searchLabel={state.selectedId ? undefined : copy.search}
                query={state.query}
                onQueryChange={state.search}
                autoFocusSearch={props.active !== false && !state.selectedId}
                onResumeTyping={props.onResumeTyping}
            >
                {state.selectedId ? (
                    <div className={menuStyles.textResults}>
                        {state.detail.isPending && (
                            <LoadingState>{copy.search}</LoadingState>
                        )}
                        {state.detail.isError && (
                            <p role='alert'>{copy.error}</p>
                        )}
                        {state.reference && (
                            <div className={styles.referenceEditor}>
                                <p className={styles.hint}>{copy.passage}</p>
                                <label>
                                    {copy.source}
                                    <textarea
                                        ref={state.sourceRef}
                                        value={state.reference.content}
                                        readOnly
                                        rows={6}
                                        dir='auto'
                                    />
                                </label>
                                <div className={styles.referenceActions}>
                                    <button
                                        type='button'
                                        onClick={state.useSourceSelection}
                                    >
                                        {copy.selectPassage}
                                    </button>
                                    <button
                                        type='button'
                                        onClick={state.useFullSource}
                                    >
                                        {copy.fullText}
                                    </button>
                                </div>
                                <p className={styles.hint}>{sourceExcerpt}</p>
                                {state.reference.translation && (
                                    <>
                                        <label
                                            className={styles.referenceCheckbox}
                                        >
                                            <input
                                                type='checkbox'
                                                checked={
                                                    state.includeTranslation
                                                }
                                                onChange={
                                                    state.toggleTranslation
                                                }
                                            />
                                            {copy.translation}
                                        </label>
                                        {state.includeTranslation && (
                                            <>
                                                <textarea
                                                    ref={state.translationRef}
                                                    value={
                                                        state.reference
                                                            .translation
                                                    }
                                                    readOnly
                                                    rows={4}
                                                    dir='auto'
                                                    aria-label={
                                                        copy.translation
                                                    }
                                                />
                                                <div
                                                    className={
                                                        styles.referenceActions
                                                    }
                                                >
                                                    <button
                                                        type='button'
                                                        onClick={
                                                            state.useTranslationSelection
                                                        }
                                                    >
                                                        {copy.selectPassage}
                                                    </button>
                                                    <button
                                                        type='button'
                                                        onClick={
                                                            state.useFullTranslation
                                                        }
                                                    >
                                                        {copy.fullText}
                                                    </button>
                                                </div>
                                                <p className={styles.hint}>
                                                    {translationExcerpt}
                                                </p>
                                            </>
                                        )}
                                    </>
                                )}
                                <button
                                    type='button'
                                    onClick={state.attach}
                                    disabled={!state.passage.trim()}
                                >
                                    {copy.add}
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={menuStyles.textResults}>
                        {state.results.isPending && (
                            <LoadingState>{copy.search}</LoadingState>
                        )}
                        {state.results.isError && (
                            <p role='alert'>{copy.error}</p>
                        )}
                        {state.results.data?.references.length === 0 && (
                            <p>{copy.empty}</p>
                        )}
                        {state.results.data?.references.map((item) => (
                            <ReferenceRow
                                key={item.id}
                                id={item.id}
                                title={item.title}
                                onSelect={state.setSelectedId}
                            />
                        ))}
                    </div>
                )}
            </CommandMenu>
        </section>
    );
}

function ReferenceRow({
    id,
    title,
    onSelect,
}: {
    id: string;
    title: string;
    onSelect(id: string): void;
}) {
    function select() {
        onSelect(id);
    }

    return (
        <CommandMenuItem
            icon={<FileText size={18} />}
            label={title}
            onSelect={select}
        />
    );
}
