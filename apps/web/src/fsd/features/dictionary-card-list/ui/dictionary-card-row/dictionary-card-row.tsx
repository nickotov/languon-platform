import {
    Archive,
    RotateCcw,
    Pencil,
    MoreHorizontal,
    Sparkles,
    User,
    Users,
} from 'lucide-react';
import {
    authorshipMessageKey,
    languageDirection,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Card, Menu } from '@/fsd/shared/ui';
import type { DictionaryCardRowProps } from '../../types';
import { OptionalFields } from '../optional-fields/optional-fields';
import styles from '../dictionary-card-list/dictionary-card-list.module.css';

export function DictionaryCardRow({
    card,
    index,
    dictionary,
    languages,
    lifecycle,
    pending,
    generationAvailable,
    onEdit,
    onGenerate,
    onLifecycle,
    renderAudio,
}: DictionaryCardRowProps) {
    const { t } = useI18n();
    const sourceDirection = languageDirection(
        languages,
        dictionary.sourceLanguage,
    );
    const targetDirection = languageDirection(
        languages,
        dictionary.targetLanguage,
    );
    const sourceAudio = renderAudio?.(card, 'source');
    const translationAudio = renderAudio?.(card, 'translation');
    const hasOverrides = Object.values(card.overrides ?? {}).some(
        (value) => value !== null && value !== 'inherit',
    );
    const inheritanceLabel = t(
        hasOverrides
            ? 'dictionary.cards.overrides'
            : 'dictionary.cards.defaults',
    );
    const authorshipLabel = t(authorshipMessageKey(card.authorship));
    const authorshipIcon =
        card.authorship === 'human' ? (
            <User aria-hidden size={14} />
        ) : card.authorship === 'ai-generated' ? (
            <Sparkles aria-hidden size={14} />
        ) : (
            <Users aria-hidden size={14} />
        );
    const authorshipTone = card.authorship === 'human' ? 'neutral' : 'info';
    const inheritanceTone = hasOverrides ? 'warning' : 'neutral';

    const menuLabel = t('dictionary.cards.actions', { position: index + 1 });
    const editingDisabled = pending || lifecycle === 'archived';
    const archived = lifecycle === 'archived';

    function edit() {
        onEdit(card);
    }
    function generate() {
        onGenerate?.(card);
    }
    function changeLifecycle() {
        onLifecycle(card);
    }

    const items = [
        {
            disabled: editingDisabled,
            label: t('dictionary.cards.edit'),
            onSelect: edit,
            icon: <Pencil size={16} />,
        },
        ...(onGenerate
            ? [
                  {
                      disabled: editingDisabled,
                      label: t(
                          generationAvailable
                              ? 'dictionary.cards.regenerate'
                              : 'dictionary.generation.openReview',
                      ),
                      onSelect: generate,
                      icon: <Sparkles size={16} />,
                  },
              ]
            : []),
        {
            disabled: pending,
            label: t(
                archived
                    ? 'dictionary.cards.restore'
                    : 'dictionary.cards.archive',
            ),
            onSelect: changeLifecycle,
            icon: archived ? <RotateCcw size={16} /> : <Archive size={16} />,
        },
    ];

    return (
        <li>
            <Card className={styles.card} variant='outlined' padding='none'>
                <div className={styles.topRow}>
                    <div className={styles.pair}>
                        <strong
                            dir={sourceDirection}
                            lang={dictionary.sourceLanguage}
                        >
                            <span>{card.values.source}</span>
                            {sourceAudio}
                        </strong>
                        <strong
                            dir={targetDirection}
                            lang={dictionary.targetLanguage}
                        >
                            <span>{card.values.translation}</span>
                            {translationAudio}
                        </strong>
                    </div>
                    <Menu
                        iconOnly
                        items={items}
                        label={menuLabel}
                        trigger={<MoreHorizontal aria-hidden size={16} />}
                    />
                </div>
                <OptionalFields
                    card={card}
                    dictionary={dictionary}
                    languages={languages}
                    renderAudio={renderAudio}
                />
                <div className={styles.metadata}>
                    <Badge
                        size='sm'
                        tone={authorshipTone}
                        icon={authorshipIcon}
                    >
                        {authorshipLabel}
                    </Badge>
                    <Badge size='sm' tone={inheritanceTone}>
                        {inheritanceLabel}
                    </Badge>
                    {archived ? (
                        <Badge size='sm'>
                            {t('dictionary.lifecycle.archived')}
                        </Badge>
                    ) : null}
                </div>
            </Card>
        </li>
    );
}
