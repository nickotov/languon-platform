import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChevronRight, FileText, Layers, ListChecks } from 'lucide-react';
import { CommandMenu } from './command-menu';
import { CommandMenuItem } from './ui/command-menu-item/command-menu-item';
import styles from './command-menu.stories.module.css';

function noAction() {}

function MenuExample({ nested = false }: { nested?: boolean }) {
    const [query, setQuery] = useState('');

    return (
        <div className={styles.frame}>
            <CommandMenu
                title={nested ? 'Упражнения' : 'Add to prompt'}
                closeLabel='Close picker'
                onClose={noAction}
                backLabel='Back'
                onBack={nested ? noAction : undefined}
                searchLabel={nested ? 'Поиск упражнений' : 'Search commands'}
                query={query}
                onQueryChange={setQuery}
                hint='↑ ↓  ·  ↵  ·  esc'
            >
                <CommandMenuItem
                    icon={<ListChecks size={16} />}
                    label={
                        nested ? 'Перефразируйте, сохранив смысл' : 'Exercises'
                    }
                    description={
                        nested
                            ? 'Сохраните исходный смысл, используя другую конструкцию.'
                            : '19 ways to practise your material'
                    }
                    trailing={<ChevronRight size={14} />}
                    onSelect={noAction}
                />
                <CommandMenuItem
                    icon={<Layers size={16} />}
                    label={
                        nested
                            ? 'Сопоставьте слова и значения'
                            : 'Document blocks'
                    }
                    description='Vocabulary, grammar and reading'
                    trailing={<ChevronRight size={14} />}
                    onSelect={noAction}
                />
                <CommandMenuItem
                    icon={<FileText size={16} />}
                    label={
                        nested ? 'Создать набор упражнений вручную' : 'Texts'
                    }
                    trailing={<ChevronRight size={14} />}
                    onSelect={noAction}
                />
            </CommandMenu>
        </div>
    );
}

const meta = {
    title: 'Shared/Command menu',
    component: MenuExample,
} satisfies Meta<typeof MenuExample>;

export default meta;
export const Root: StoryObj<typeof meta> = {};
export const LongLocalizedSubmenu: StoryObj<typeof meta> = {
    args: { nested: true },
};
