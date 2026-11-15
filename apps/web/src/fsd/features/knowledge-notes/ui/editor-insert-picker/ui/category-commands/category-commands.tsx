import { Blocks, ChevronRight, Library, ListChecks, Type } from 'lucide-react';
import { CommandMenuItem } from '@/fsd/shared/ui';
import type { editorInsertCopy } from '../../../../lib/editor-insert-copy';

export function CategoryCommands({
    copy,
    count,
    onBasic,
    onLearning,
    onExercises,
    onLibrary,
}: {
    copy: ReturnType<typeof editorInsertCopy>;
    count: number;
    onBasic(): void;
    onLearning(): void;
    onExercises(): void;
    onLibrary?: (() => void) | undefined;
}) {
    return (
        <>
            <CommandMenuItem
                icon={<Type size={18} aria-hidden='true' />}
                label={copy.basic}
                trailing={<ChevronRight size={16} aria-hidden='true' />}
                onSelect={onBasic}
            />
            <CommandMenuItem
                icon={<Blocks size={18} aria-hidden='true' />}
                label={copy.learning}
                trailing={<ChevronRight size={16} aria-hidden='true' />}
                onSelect={onLearning}
            />
            <CommandMenuItem
                icon={<ListChecks size={18} aria-hidden='true' />}
                label={copy.exercises}
                trailing={
                    <>
                        <span>{count}</span>
                        <ChevronRight size={16} aria-hidden='true' />
                    </>
                }
                onSelect={onExercises}
            />
            {onLibrary && (
                <CommandMenuItem
                    icon={<Library size={18} aria-hidden='true' />}
                    label={copy.library}
                    trailing={<ChevronRight size={16} aria-hidden='true' />}
                    onSelect={onLibrary}
                />
            )}
        </>
    );
}
