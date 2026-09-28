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
    const { effective, active, stale, duplicate } = authoring;
    const className = [styles.card, embedded ? styles.embedded : '']
        .filter(Boolean)
        .join(' ');
    const title = card
        ? t('dictionary.card.editTitle')
        : t('dictionary.card.createTitle');
    const cancelLabel = card
        ? t('common.cancel')
        : t('dictionary.card.discardDraft');
    const saveDisabled =
        active ||
        ai?.pending ||
        ai?.successorActive ||
        !authoring.validValues ||
        !authoring.validTranslationContext;
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
        stale,
        hiddenSuggestionIds: authoring.hiddenSuggestionIds,
        reviewedSuggestionIds: authoring.reviewedSuggestionIds,
        selectedSuggestions: authoring.selectedSuggestions,
        acceptSuggestion: authoring.acceptSuggestion,
        discardSuggestion: authoring.discardSuggestion,
        generatingScope: authoring.generatingScope,
        generateField: authoring.generateField,
    };

    const optionalFields: DictionaryCardAuthoringField[] = [];

    if (effective.transcriptionEnabled) optionalFields.push('transcription');
    if (effective.definitionEnabled) optionalFields.push('definition');
    if (effective.exampleEnabled) optionalFields.push('example');
    if (effective.exampleTranslationEnabled)
        optionalFields.push('exampleTranslation');

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
                        disabled={
                            active ||
                            pending ||
                            Boolean(ai?.pending || ai?.successorActive)
                        }
                        onChange={authoring.setTranslationContext}
                    />
                    {duplicate ? (
                        <InlineAlert tone='warning'>
                            {t('dictionary.card.duplicateWarning')}
                        </InlineAlert>
                    ) : null}
                    {displayedAi ? (
                        <AuthoringAiAssistance
                            ai={displayedAi}
                            active={active}
                            stale={stale}
                            validSource={authoring.validSource}
                            canGenerate={
                                authoring.isLatestVersion &&
                                authoring.validTranslationContext
                            }
                            generateAll={authoring.generateAll}
                            acceptAllSuggestions={
                                authoring.acceptAllSuggestions
                            }
                            availableSuggestionCount={
                                authoring.availableSuggestionCount
                            }
                            availableSuggestionFieldCount={
                                authoring.availableSuggestionFieldCount
                            }
                            bulkAcceptSuggestionCount={
                                authoring.bulkAcceptSuggestionCount
                            }
                            discardAllSuggestions={
                                authoring.discardAllSuggestions
                            }
                        />
                    ) : null}
                    {stale ? (
                        <InlineAlert tone='warning'>
                            {t('dictionary.authoring.stale')}
                            <Button
                                onClick={authoring.generateAll}
                                disabled={active || !authoring.isLatestVersion}
                                size='compact'
                                variant='secondary'
                                type='button'
                            >
                                {t('dictionary.authoring.regenerateAll')}
                            </Button>
                        </InlineAlert>
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
                    {active ? (
                        <p className={styles.saveHint}>
                            {t('dictionary.authoring.savingPaused')}
                        </p>
                    ) : null}
                    <div className={styles.footerRow}>
                        <FormVersionNavigation
                            current={authoring.activeVersionIndex}
                            onChange={authoring.setActiveVersion}
                            total={authoring.versionCount}
                        />
                        <div className={styles.actions}>
                            <Button
                                disabled={pending || ai?.pending}
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
                                {t('dictionary.card.save')}
                            </Button>
                        </div>
                    </div>
                </div>
            </form>
        </Card>
    );
}
