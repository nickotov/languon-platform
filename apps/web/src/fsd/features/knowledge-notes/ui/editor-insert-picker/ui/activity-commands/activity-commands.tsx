import { Eye, PenLine, Sparkles } from 'lucide-react';
import { CommandMenuItem } from '@/fsd/shared/ui';
import type { editorInsertCopy } from '../../../../lib/editor-insert-copy';

export function ActivityCommands({
    copy,
    disabled,
    onGenerate,
    onCustom,
    onPreview,
}: {
    copy: ReturnType<typeof editorInsertCopy>;
    disabled: boolean;
    onGenerate(): void;
    onCustom(): void;
    onPreview(): void;
}) {
    return (
        <>
            <CommandMenuItem
                icon={<Sparkles size={18} aria-hidden='true' />}
                label={copy.generate}
                disabled={disabled}
                onSelect={onGenerate}
            />
            <CommandMenuItem
                icon={<PenLine size={18} aria-hidden='true' />}
                label={copy.manual}
                onSelect={onCustom}
            />
            <CommandMenuItem
                icon={<Eye size={18} aria-hidden='true' />}
                label={copy.preview}
                onSelect={onPreview}
            />
        </>
    );
}
