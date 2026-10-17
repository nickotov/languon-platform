import type { ChangeEvent, FormEvent } from 'react';
import { ArrowLeft, BookPlus } from 'lucide-react';
import { Button, Input } from '@/fsd/shared/ui';
import { useReadingCopy } from '../../hooks/use-reading-copy';
import styles from './collect-panel.module.css';

export function NewDictionaryForm({
    name,
    onNameChange,
    from,
    to,
    onBack,
    onSubmit,
}: {
    name: string;
    onNameChange(value: string): void;
    from: string;
    to: string;
    onBack(): void;
    onSubmit(): void;
}) {
    const t = useReadingCopy();

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        onSubmit();
    }

    function changeName(event: ChangeEvent<HTMLInputElement>) {
        onNameChange(event.target.value);
    }

    return (
        <form className={styles.form} onSubmit={submit}>
            <Input
                label={t('texts.collect.name')}
                required
                autoFocus
                maxLength={80}
                value={name}
                onChange={changeName}
            />
            <small>{t('texts.collect.atomic', { from, to })}</small>
            <div className={styles.actions}>
                <Button
                    desktopIconOnly
                    type='button'
                    variant='ghost'
                    leadingIcon={<ArrowLeft size={16} />}
                    onClick={onBack}
                >
                    {t('texts.collect.back')}
                </Button>
                <Button
                    desktopIconOnly
                    type='submit'
                    leadingIcon={<BookPlus size={16} />}
                >
                    {t('texts.collect.createAdd')}
                </Button>
            </div>
        </form>
    );
}
