'use client';
import { useId, type ChangeEvent } from 'react';
import { TextLanguageSchema } from '@languon/contracts';
import { ActionConsentDialog } from '@/fsd/entities/ai-action';
import { BilingualTextView } from '@/fsd/entities/learning-blocks';
import {
    BlockLibrarySave,
    knowledgeLearningBlockLabels,
} from '@/fsd/features/knowledge-notes';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import { usePrivateTranslation } from '../../hooks/use-private-translation';
import { privateTranslationCopy } from '../../lib/copy';
import type { KnowledgePrivateTranslationProps } from '../../types';
import styles from './knowledge-private-translation.module.css';

export function KnowledgePrivateTranslation(
    props: KnowledgePrivateTranslationProps,
) {
    const targetId = useId();
    const { locale } = useI18n();
    const copy = privateTranslationCopy(locale);
    const labels = knowledgeLearningBlockLabels(locale).view;
    const model = usePrivateTranslation(props);
    const languages = model.targets;
    const selectedLanguage = model.language ?? '';
    const noTargets = languages.length === 0;
    const names = new Intl.DisplayNames([locale], { type: 'language' });
    const overlay = model.translations.find(
        (item) => item.targetLanguage === model.language,
    );
    const privateViewKey = overlay
        ? `${overlay.targetLanguage}:${overlay.updatedAt}`
        : '';
    const block = {
        ...props.block,
        title: copy.private,
        translations: overlay
            ? [{ language: overlay.targetLanguage, segments: overlay.segments }]
            : [],
    };
    const library = {
        requestWithSession: props.requestWithSession,
        noteId: props.noteId,
        noteVersion: props.noteVersion,
        access: props.access,
        ...(overlay
            ? {
                  privateTranslation: {
                      sourceFingerprint: overlay.sourceFingerprint,
                      updatedAt: overlay.updatedAt,
                  },
              }
            : {}),
    };
    function changeLanguage(event: ChangeEvent<HTMLSelectElement>) {
        model.setLanguage(TextLanguageSchema.parse(event.target.value));
    }
    function generate() {
        void model.generate();
    }
    function cancel() {
        void model.cancel();
    }
    function retry() {
        void model.retry();
    }
    return (
        <details className={styles.root}>
            <summary>{copy.title}</summary>
            <p>{copy.notice}</p>
            {model.loading && <p role='status'>{copy.loading}</p>}
            {model.unavailable ? (
                <InlineAlert
                    tone='error'
                    actions={<Button onClick={retry}>{copy.retry}</Button>}
                >
                    {copy.unavailable}
                </InlineAlert>
            ) : (
                <>
                    {noTargets && <p>{copy.noTargets}</p>}
                    <div className={styles.label}>
                        <label htmlFor={targetId}>{copy.language}</label>
                        <select
                            id={targetId}
                            className={styles.field}
                            value={selectedLanguage}
                            onChange={changeLanguage}
                            disabled={model.busy}
                        >
                            {languages.map((language) => (
                                <option key={language} value={language}>
                                    {names.of(language) ?? language}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className={styles.actions}>
                        <Button
                            onClick={generate}
                            disabled={model.busy || model.loading || noTargets}
                        >
                            {model.busy ? copy.busy : copy.generate}
                        </Button>
                        {model.busy && model.canCancel && (
                            <Button variant='secondary' onClick={cancel}>
                                {copy.cancel}
                            </Button>
                        )}
                    </div>
                    {model.failed && (
                        <InlineAlert tone='error'>{copy.error}</InlineAlert>
                    )}
                    {overlay && (
                        <>
                            <section aria-label={copy.private}>
                                <h3>{copy.private}</h3>
                                <BilingualTextView
                                    key={privateViewKey}
                                    block={block}
                                    labels={labels}
                                />
                            </section>
                            <BlockLibrarySave block={block} context={library} />
                        </>
                    )}
                </>
            )}
            <ActionConsentDialog
                quote={model.consent.quote}
                onSend={model.consent.confirm}
                onClose={model.consent.cancel}
            />
        </details>
    );
}
