import type { LucideIcon } from 'lucide-react';
import { CommandMenuItem } from '@/fsd/shared/ui';
import { editorCommandIcons } from '../../editor-command-icons';

export function CommandRow<Value extends keyof typeof editorCommandIcons>({
    value,
    label,
    onSelect,
}: {
    value: Value;
    label: string;
    onSelect(value: Value): void;
}) {
    const Icon: LucideIcon = editorCommandIcons[value];
    function select() {
        onSelect(value);
    }

    return (
        <CommandMenuItem
            icon={<Icon size={17} aria-hidden='true' />}
            label={label}
            onSelect={select}
        />
    );
}
