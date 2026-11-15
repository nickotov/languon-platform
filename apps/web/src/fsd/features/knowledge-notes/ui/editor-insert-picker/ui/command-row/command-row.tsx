import { Button } from '@/fsd/shared/ui';
export function CommandRow<Value extends string>({
    value,
    label,
    onSelect,
}: {
    value: Value;
    label: string;
    onSelect(value: Value): void;
}) {
    function select() {
        onSelect(value);
    }

    return (
        <Button variant='ghost' onClick={select}>
            {label}
        </Button>
    );
}
