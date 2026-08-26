import type {
    DictionaryCard,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';

import {
    authorshipMessageKey,
    languageDirection,
    languageForRole,
    languageLabel,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Badge,
    Card,
    EmptyState,
    Icon,
    IconButton,
    Menu,
} from '@/fsd/shared/ui';

import styles from './dictionary-card-list.module.css';

export function DictionaryCardList({
    cards,
    dictionary,
    languages,
    lifecycle,
    reorderEnabled = true,
    generationAvailable = false,
    onEdit,
    onGenerate,
    onLifecycle,
    onMove,
    pending,
}: {
    cards: readonly DictionaryCard[];
    dictionary: OwnedDictionary;
    languages: readonly LanguageCatalogEntry[];
    lifecycle: 'active' | 'archived';
    reorderEnabled?: boolean;
    generationAvailable?: boolean;
    onEdit(card: DictionaryCard): void;
    onGenerate?(card: DictionaryCard): void;
    onLifecycle(card: DictionaryCard): void;
    onMove(card: DictionaryCard, direction: -1 | 1): void;
    pending: boolean;
}) {
    const { t } = useI18n();
    if (cards.length === 0) {
        return (
            <EmptyState title={t('dictionary.cards.empty')}>
                {t('dictionary.cards.emptyHelp')}
            </EmptyState>
        );
    }
    return (
        <ol className={styles.list}>
            {cards.map((card, index) => (
                <li key={card.id}>
                    <Card className={styles.card}>
                        <div className={styles.order} aria-hidden='true'>
                            {index + 1}
                        </div>
                        <div className={styles.content}>
                            <div className={styles.pair}>
                                <strong
                                    dir={languageDirection(
                                        languages,
                                        dictionary.sourceLanguage,
                                    )}
                                    lang={dictionary.sourceLanguage}
                                >
                                    {card.values.source}
                                </strong>
                                <span aria-hidden='true'>→</span>
                                <strong
                                    dir={languageDirection(
                                        languages,
                                        dictionary.targetLanguage,
                                    )}
                                    lang={dictionary.targetLanguage}
                                >
                                    {card.values.translation}
                                </strong>
                            </div>
                            <OptionalFields
                                card={card}
                                dictionary={dictionary}
                                languages={languages}
                            />
                            <Badge>
                                {t(authorshipMessageKey(card.authorship))}
                            </Badge>
                        </div>
                        <div className={styles.actions}>
                            <div className={styles.orderActions}>
                                <IconButton
                                    disabled={
                                        pending ||
                                        !reorderEnabled ||
                                        index === 0 ||
                                        lifecycle === 'archived'
                                    }
                                    onClick={() => onMove(card, -1)}
                                    type='button'
                                    label={t('dictionary.cards.moveEarlier')}
                                >
                                    <Icon>↑</Icon>
                                </IconButton>
                                <IconButton
                                    disabled={
                                        pending ||
                                        !reorderEnabled ||
                                        index === cards.length - 1 ||
                                        lifecycle === 'archived'
                                    }
                                    onClick={() => onMove(card, 1)}
                                    type='button'
                                    label={t('dictionary.cards.moveLater')}
                                >
                                    <Icon>↓</Icon>
                                </IconButton>
                            </div>
                            <Menu
                                items={[
                                    {
                                        disabled:
                                            pending || lifecycle === 'archived',
                                        label: t('dictionary.cards.edit'),
                                        onSelect: () => onEdit(card),
                                    },
                                    ...(onGenerate
                                        ? [
                                              {
                                                  disabled:
                                                      pending ||
                                                      lifecycle === 'archived',
                                                  label: generationAvailable
                                                      ? t(
                                                            'dictionary.generation.start',
                                                        )
                                                      : t(
                                                            'dictionary.generation.openReview',
                                                        ),
                                                  onSelect: () =>
                                                      onGenerate(card),
                                              },
                                          ]
                                        : []),
                                    {
                                        disabled: pending,
                                        label:
                                            lifecycle === 'active'
                                                ? t('dictionary.cards.archive')
                                                : t('dictionary.cards.restore'),
                                        onSelect: () => onLifecycle(card),
                                        ...(lifecycle === 'active'
                                            ? ({ tone: 'danger' } as const)
                                            : {}),
                                    },
                                ]}
                                label={t('dictionary.cards.actions', {
                                    position: index + 1,
                                })}
                                trigger={<Icon>⋯</Icon>}
                            />
                        </div>
                    </Card>
                </li>
            ))}
        </ol>
    );
}

function OptionalFields({
    card,
    dictionary,
    languages,
}: {
    card: DictionaryCard;
    dictionary: OwnedDictionary;
    languages: readonly LanguageCatalogEntry[];
}) {
    const { locale, t } = useI18n();
    const fields = [
        card.effectiveSettings.transcriptionEnabled && card.values.transcription
            ? {
                  key: 'transcription',
                  label: t('dictionary.field.transcription'),
                  lang: dictionary.sourceLanguage,
                  value: card.values.transcription,
              }
            : null,
        card.effectiveSettings.definitionEnabled && card.values.definition
            ? {
                  key: 'definition',
                  label: t('dictionary.field.definition'),
                  lang: languageForRole(
                      card.effectiveSettings.definitionLanguage,
                      dictionary.sourceLanguage,
                      dictionary.targetLanguage,
                  ),
                  value: card.values.definition,
              }
            : null,
        card.effectiveSettings.exampleEnabled && card.values.example
            ? {
                  key: 'example',
                  label: t('dictionary.field.example'),
                  lang: languageForRole(
                      card.effectiveSettings.exampleLanguage,
                      dictionary.sourceLanguage,
                      dictionary.targetLanguage,
                  ),
                  value: card.values.example,
              }
            : null,
        card.effectiveSettings.exampleTranslationEnabled &&
        card.values.exampleTranslation
            ? {
                  key: 'exampleTranslation',
                  label: t('dictionary.field.exampleTranslation'),
                  lang: languageForRole(
                      card.effectiveSettings.exampleTranslationLanguage,
                      dictionary.sourceLanguage,
                      dictionary.targetLanguage,
                  ),
                  value: card.values.exampleTranslation,
              }
            : null,
    ].filter((value): value is NonNullable<typeof value> => value !== null);
    if (!fields.length) return null;
    return (
        <dl className={styles.fields}>
            {fields.map((field) => (
                <div key={field.key}>
                    <dt>
                        {field.label} ·{' '}
                        {languageLabel(languages, field.lang, locale)}
                    </dt>
                    <dd
                        dir={languageDirection(languages, field.lang)}
                        lang={field.lang}
                    >
                        {field.value}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
