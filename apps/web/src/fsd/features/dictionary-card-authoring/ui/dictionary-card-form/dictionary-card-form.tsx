'use client';

import type { DictionaryCardAuthoringField } from '../../types';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Button, Card, InlineAlert } from '@/fsd/shared/ui';
import { useCardAuthoring } from '../../hooks/use-card-authoring';
import type {
    DictionaryCardFormProps,
    AuthoringFieldContent,
    AuthoringFieldSuggestions,
} from '../../types';
import { AuthoringField } from '../authoring-field/authoring-field';
import { AuthoringAiAssistance } from '../authoring-ai-assistance/authoring-ai-assistance';
import { CardFieldOverrides } from '../card-field-overrides/card-field-overrides';
import { CardTranslationContext } from '../card-translation-context/card-translation-context';
import { FormVersionNavigation } from './form-version-navigation';
import { AutoSaveFeedback } from './auto-save-feedback';
import styles from './dictionary-card-form.module.css';

export type {
    DictionaryCardDraft,
    DictionaryCardAuthoringAction,
    DictionaryCardAuthoringAI,
} from '../../types';

export function DictionaryCardForm(props: DictionaryCardFormProps) {
    const { t } = useI18n();
    const {
        card,
        dictionary,
        languages,
        ai,
        embedded = false,
        error,
        onCancel,
        onReloadConflict,
        pending,
        showHeading = true,
    } = props;
    const authoring = useCardAuthoring(props);
    const { effective, active, duplicate, locked } = authoring;
    const className = [styles.card, embedded ? styles.embedded : '']
        .filter(Boolean)
        .join(' ');
    const title = card
        ? t('dictionary.card.editTitle')
        : t('dictionary.card.createTitle');
    const cancelLabel = card
        ? t('dictionary.card.close')
        : t('dictionary.card.discardDraft');
    const saveLabel = card
        ? t('dictionary.card.save')
        : t('dictionary.card.create');
    const saveDisabled =
        locked || !authoring.validValues || !authoring.validTranslationContext;
    const closeDisabled = Boolean(
        pending ||
        ai?.pending ||
        active ||
        authoring.autoSaveStatus === 'saving',
    );
    const displayedAi = ai
        ? { ...ai, proposal: authoring.proposal }
        : undefined;
    const fieldContent: AuthoringFieldContent = {
        effective,
        values: authoring.draft.values,
        setValue: authoring.setValue,
    };
    const fieldSuggestions: AuthoringFieldSuggestions = {
        ai: displayedAi
            ? {
                  available: displayedAi.available,
                  format: displayedAi.format,
                  pending: displayedAi.pending,
                  proposal: displayedAi.proposal ?? null,
              }
            : undefined,
        active,
        canGenerate:
            authoring.isLatestVersion && authoring.validTranslationContext,
        locked,
        generatingScope: authoring.generatingScope,
        generateField: authoring.generateField,
    };

    const optionalFields: DictionaryCardAuthoringField[] = [];

    if (effective.transcriptionEnabled) optionalFields.push('transcription');
    if (effective.definitionEnabled) optionalFields.push('definition');
    if (effective.exampleEnabled) optionalFields.push('example');
    if (effective.exampleTranslationEnabled)
        optionalFields.push('exampleTranslation');
    const generatedFields = ['translation', ...optionalFields] as const;
    const hasContent = generatedFields.some((field) =>
        Boolean(authoring.draft.values[field]?.trim()),
    );

    function renderField(field: DictionaryCardAuthoringField) {
        return (
            <AuthoringField
                key={field}
                field={field}
                dictionary={dictionary}
                languages={languages}
                content={fieldContent}
                suggestions={fieldSuggestions}
            />
        );
    }
    function reloadConflict() {
        void Promise.resolve(onReloadConflict?.()).catch(() => undefined);
    }

    return (
        <Card className={className}>
            {showHeading ? (
                <header className={styles.header}>
                    <h2>{title}</h2>
                </header>
            ) : null}
            <form className={styles.form} onSubmit={authoring.handleSubmit}>
                <div className={styles.body}>
                    <AuthoringField
                        field='source'
                        dictionary={dictionary}
                        languages={languages}
                        content={fieldContent}
                        suggestions={fieldSuggestions}
                    />
                    <CardTranslationContext
                        cardContext={authoring.draft.translationContext}
                        dictionaryContext={dictionary.translationContext}
                        disabled={locked}
                        onChange={authoring.setTranslationContext}
                    />
                    {duplicate ? (
                        <InlineAlert tone='warning'>
                            {t('dictionary.card.duplicateWarning')}
                        </InlineAlert>
                    ) : null}
                    {authoring.stale ? (
                        <InlineAlert tone='warning'>
                            {t('dictionary.authoring.stale')}
                        </InlineAlert>
                    ) : null}
                    {displayedAi ? (
                        <AuthoringAiAssistance
                            ai={displayedAi}
                            active={active}
                            locked={locked}
                            hasContent={hasContent}
                            validSource={authoring.validSource}
                            canGenerate={
                                authoring.isLatestVersion &&
                                authoring.validTranslationContext
                            }
                            generateAll={authoring.generateAll}
                        />
                    ) : null}
                    <AuthoringField
                        field='translation'
                        dictionary={dictionary}
                        languages={languages}
                        content={fieldContent}
                        suggestions={fieldSuggestions}
                    />
                    {optionalFields.length ? (
                        <div className={styles.optionalFields}>
                            <p className={styles.optionalHeading}>
                                {t('dictionary.authoring.optionalContent')}
                                <Badge size='sm'>
                                    {t('dictionary.authoring.mayStayEmpty')}
                                </Badge>
                            </p>
                            {optionalFields.map(renderField)}
                        </div>
                    ) : null}
                    <CardFieldOverrides
                        dictionary={dictionary}
                        disabled={locked}
                        languages={languages}
                        effective={effective}
                        overrides={authoring.draft.overrides}
                        setOverride={authoring.setOverride}
                        replaceOverrides={authoring.replaceOverrides}
                    />
                    {error ? (
                        <InlineAlert tone='danger'>
                            <p>{error}</p>
                            {onReloadConflict ? (
                                <Button
                                    onClick={reloadConflict}
                                    type='button'
                                    variant='secondary'
                                >
                                    {t('dictionary.conflict.reload')}
                                </Button>
                            ) : null}
                        </InlineAlert>
                    ) : null}
                </div>
                <div className={styles.footer}>
                    <AutoSaveFeedback
                        existing={Boolean(card)}
                        hasGeneratedContent={Boolean(authoring.proposal)}
                        onRetry={authoring.retryAutoSave}
                        status={authoring.autoSaveStatus}
                    />
                    {active ? (
                        <p className={styles.saveHint}>
                            {t('dictionary.authoring.savingPaused')}
                        </p>
                    ) : null}
                    <div className={styles.footerRow}>
                        <FormVersionNavigation
                            current={authoring.activeVersionIndex}
                            disabled={locked}
                            onChange={authoring.setActiveVersion}
                            total={authoring.versionCount}
                        />
                        <div className={styles.actions}>
                            <Button
                                disabled={closeDisabled}
                                onClick={onCancel}
                                type='button'
                                variant='ghost'
                            >
                                {cancelLabel}
                            </Button>
                            <Button
                                className={styles.primaryAction}
                                disabled={saveDisabled}
                                loading={pending}
                                type='submit'
                            >
                                {saveLabel}
                            </Button>
                        </div>
                    </div>
                </div>
            </form>
        </Card>
    );
}
