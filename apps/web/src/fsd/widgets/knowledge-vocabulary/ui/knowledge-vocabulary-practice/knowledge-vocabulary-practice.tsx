'use client';
import { useMemo, useRef } from 'react';
import type {
    LearningBlock,
    WorkbookLearningShareAccess,
} from '@languon/contracts';
import { useQuery } from '@tanstack/react-query';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { VocabularyTraining } from './vocabulary-training';
import { createKnowledgeSentenceApi } from '../../api/knowledge-sentence-api';
import { Ellipsis } from 'lucide-react';
import styles from './knowledge-vocabulary-practice.module.css';
import { Button, Menu, type MenuItem } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { createKnowledgeFlashcardApi } from '../../api/knowledge-flashcard-api';
export interface KnowledgeVocabularyPracticeProps {
    noteId: string;
    blockMenu?: boolean | undefined;
    commonMenuItems?: MenuItem[] | undefined;
    block: Extract<LearningBlock, { type: 'vocabulary' }>;
    actorId: string;
    requestWithSession: RequestWithSession;
    access?: WorkbookLearningShareAccess | undefined;
}
export function KnowledgeVocabularyPractice(
    props: KnowledgeVocabularyPracticeProps,
) {
    const identity = `${props.actorId}:${props.noteId}:${props.block.id}:${props.access?.kind}:${props.access?.locator}:${props.access?.key}`;
    return <Practice key={identity} {...props} identity={identity} />;
}
function Practice({
    identity,
    ...props
}: KnowledgeVocabularyPracticeProps & { identity: string }) {
    const { locale } = useI18n();
    const options = useRef(props);
    const api = useMemo(
        () =>
            createKnowledgeFlashcardApi({
                noteId: options.current.noteId,
                blockId: options.current.block.id,
                requestWithSession: options.current.requestWithSession,
                access: options.current.access,
            }),
        [],
    );
    const sentenceApi = useMemo(
        () =>
            createKnowledgeSentenceApi({
                noteId: options.current.noteId,
                blockId: options.current.block.id,
                requestWithSession: options.current.requestWithSession,
                access: options.current.access,
            }),
        [],
    );
    const catalog = useQuery({
        queryKey: ['dictionary-languages'],
        queryFn: ({ signal }) => dictionaryApi.listLanguages(signal),
    });
    const source = catalog.data?.languages.find(
        (language) => language.tag === props.block.language,
    );
    const target = catalog.data?.languages.find(
        (language) => language.tag === props.block.translationLanguage,
    );
    const label =
        props.block.title ??
        {
            en: 'Vocabulary',
            ru: 'Словарь',
            fr: 'Vocabulaire',
            es: 'Vocabulario',
        }[locale];
    const blockTrigger = <Ellipsis size={16} aria-hidden />;
    if (
        props.blockMenu &&
        (catalog.isPending || catalog.isError || !source || !target)
    )
        return (
            <Menu
                iconOnly
                label={label}
                trigger={blockTrigger}
                triggerClassName={styles.menuTrigger}
                items={props.commonMenuItems ?? []}
            />
        );
    if (catalog.isPending)
        return (
            <p role='status'>
                {
                    {
                        en: 'Loading practice…',
                        es: 'Cargando práctica…',
                        fr: 'Chargement de la pratique…',
                        ru: 'Загрузка практики…',
                    }[locale]
                }
            </p>
        );
    if (catalog.isError)
        return (
            <Button variant='secondary' onClick={() => void catalog.refetch()}>
                {
                    {
                        en: 'Retry practice',
                        es: 'Reintentar práctica',
                        fr: 'Réessayer la pratique',
                        ru: 'Повторить загрузку практики',
                    }[locale]
                }
            </Button>
        );
    if (!source || !target)
        return (
            <p>
                {
                    {
                        en: 'Practice is not available for this language yet.',
                        es: 'La práctica aún no está disponible para este idioma.',
                        fr: 'La pratique n’est pas encore disponible pour cette langue.',
                        ru: 'Практика для этого языка пока недоступна.',
                    }[locale]
                }
            </p>
        );
    return (
        <VocabularyTraining
            sentenceApi={sentenceApi}
            additionalItems={props.commonMenuItems ?? []}
            menuTrigger={props.blockMenu ? blockTrigger : undefined}
            menuLabel={props.blockMenu ? label : undefined}
            triggerClassName={props.blockMenu ? styles.menuTrigger : undefined}
            capabilityIdentity={`${props.actorId}:${props.noteId}:${props.block.id}:${props.access?.kind}:${props.access?.locator}`}
            api={api}
            signedIn
            identity={identity}
            dictionaryTitle={
                props.block.title ??
                {
                    en: 'Vocabulary',
                    es: 'Vocabulario',
                    fr: 'Vocabulaire',
                    ru: 'Словарь',
                }[locale]
            }
            sourceLanguage={{
                code: source.tag,
                name: source.displayNames[locale],
                direction: source.direction,
            }}
            targetLanguage={{
                code: target.tag,
                name: target.displayNames[locale],
                direction: target.direction,
            }}
            activeCount={props.block.entries.length}
        />
    );
}
