import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import type { SavedSentence } from '../../types';
import { SentenceRow } from './sentence-row';

const sentence: SavedSentence = {
    id: '10000000-0000-4000-8000-000000000001',
    dictionaryId: '10000000-0000-4000-8000-000000000002',
    sentenceLanguage: 'es',
    answerLanguage: 'en',
    sentence: 'La biblioteca abre temprano todos los días.',
    reference: 'The library opens early every day.',
    dictionaryHints: [],
    contextHints: [],
    createdAt: '2026-11-01T12:00:00Z',
    ownership: 'mine',
    outdated: false,
    archivedByMe: false,
    globallyArchived: false,
    enrichment: 'rich',
    version: 1,
};

function InteractiveSentenceRow(props: ComponentProps<typeof SentenceRow>) {
    const [selected, setSelected] = useState(props.selected);
    const [archived, setArchived] = useState(props.sentence.archivedByMe);
    const [viewed, setViewed] = useState(false);
    const currentSentence = { ...props.sentence, archivedByMe: archived };

    function toggle() {
        setSelected((value) => !value);
    }

    function archive() {
        setArchived((value) => !value);
    }

    function view(_id: string, trigger: HTMLElement) {
        setViewed(true);
        trigger.focus();
    }

    return (
        <>
            <ul>
                <SentenceRow
                    {...props}
                    sentence={currentSentence}
                    selected={selected}
                    onToggle={toggle}
                    onView={view}
                    onArchiveToggle={archive}
                />
            </ul>
            {viewed && <p role='status'>Sentence preview requested.</p>}
        </>
    );
}

const meta = {
    component: SentenceRow,
    title: 'Features/Sentence library/Row',
    decorators: [
        (Story) => (
            <I18nProvider locale='en' messages={en}>
                <Story />
            </I18nProvider>
        ),
    ],
    render: InteractiveSentenceRow,
    args: {
        sentence,
        selected: false,
        locked: false,
        onToggle() {},
        onView() {},
        onArchiveToggle() {},
    },
} satisfies Meta<typeof SentenceRow>;

export default meta;

export const Default: StoryObj<typeof meta> = {};

export const ArchivedSharedLongSentence: StoryObj<typeof meta> = {
    args: {
        selected: true,
        sentence: {
            ...sentence,
            sentence:
                'Aunque la biblioteca del barrio está cerrada por reformas esta semana, los estudiantes pueden consultar todos los libros digitales desde casa y devolver sus préstamos cuando vuelva a abrir.',
            ownership: 'shared',
            archivedByMe: true,
            outdated: true,
            globallyArchived: true,
        },
    },
};

export const Locked: StoryObj<typeof meta> = {
    args: { locked: true },
};
