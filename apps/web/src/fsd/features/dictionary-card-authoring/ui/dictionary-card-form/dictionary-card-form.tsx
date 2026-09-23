'use client';

import type { DictionaryCardValues } from '@languon/contracts';
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
        active || ai?.successorActive || !authoring.validValues;
    const fieldContent: AuthoringFieldContent = {
        effective,
        values: authoring.draft.values,
        setValue: authoring.setValue,
    };
    const fieldSuggestions: AuthoringFieldSuggestions = {
        ai: ai
            ? { pending: ai.pending, proposal: ai.proposal ?? null }
            : undefined,
        active,
        stale,
        hiddenSuggestionIds: authoring.hiddenSuggestionIds,
        selectedSuggestions: authoring.selectedSuggestions,
        acceptSuggestion: authoring.acceptSuggestion,
        discardSuggestion: authoring.discardSuggestion,
        regenerateField: authoring.regenerateField,
    };

    const optionalFields: Array<keyof DictionaryCardValues> = [];

    if (effective.transcriptionEnabled) optionalFields.push('transcription');
    if (effective.definitionEnabled) optionalFields.push('definition');
    if (effective.exampleEnabled) optionalFields.push('example');
    if (effective.exampleTranslationEnabled)
        optionalFields.push('exampleTranslation');

    function renderField(field: keyof DictionaryCardValues) {
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
                    {duplicate ? (
                        <InlineAlert tone='warning'>
                            {t('dictionary.card.duplicateWarning')}
                        </InlineAlert>
                    ) : null}
                    {!card && ai ? (
                        <AuthoringAiAssistance
                            ai={ai}
                            active={active}
                            stale={stale}
                            validSource={authoring.validSource}
                            generateAll={authoring.generateAll}
                        />
                    ) : null}
                    {card ? (
                        <InlineAlert tone='tip'>
                            {t('dictionary.authoring.editHelp')}
                        </InlineAlert>
                    ) : null}
                    {stale ? (
                        <InlineAlert tone='warning'>
                            {t('dictionary.authoring.stale')}
                            <Button
                                onClick={authoring.generateAll}
                                disabled={active}
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
                    <div className={styles.actions}>
                        <Button
                            disabled={pending}
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
            </form>
        </Card>
    );
}
