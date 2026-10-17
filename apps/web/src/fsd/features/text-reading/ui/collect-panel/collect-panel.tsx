'use client';
import { useState } from 'react';
import { NewDictionaryForm } from './new-dictionary-form';
import { SelectionContext } from './selection-context';
import { collectionFailureKey } from '../../lib/collection-failure';
import { DuplicatePreview } from './duplicate-preview';
import { DictionaryChoices } from './dictionary-choices';
import type { RequestWithTextSession } from '@/fsd/entities/texts';
import { BookPlus, Info, LogIn, Plus } from 'lucide-react';
import { Button, ButtonLink, Skeleton } from '@/fsd/shared/ui';
import type { CollectController } from '../../hooks/use-collect';
import { useReadingCopy } from '../../hooks/use-reading-copy';
import styles from './collect-panel.module.css';

export function CollectPanel({
    collect: c,
    onRequireSignIn,
    requestWithSession,
}: {
    collect: CollectController;
    requestWithSession?: RequestWithTextSession | undefined;
    onRequireSignIn?: (() => void) | undefined;
}) {
    const t = useReadingCopy();
    const [chosen, setChosen] = useState('');
    const [name, setName] = useState('');
    const selection = c.selection;
    if (!selection) return null;
    const [from, to] = c.direction;
    const selected = c.dictionaries.find((d) => d.id === chosen);
    const target = selected
        ? {
              kind: 'existing' as const,
              dictionaryId: selected.id,
              expectedDictionaryVersion: selected.version,
              expectedSettingsVersion: selected.settingsVersion,
          }
        : null;
    const busy = target ? c.isInflight(target) : false;
    const submit = () => {
        if (target) c.submit(target);
    };

    function createDictionary() {
        c.setStep('new');
    }

    function chooseDictionary() {
        c.setStep('pick');
    }

    function submitNewDictionary() {
        if (name.trim()) c.submit({ kind: 'new', name: name.trim() });
    }

    function cancel() {
        void c.cancel();
    }

    return (
        <div className={styles.panel}>
            {c.step !== 'signin' && (
                <SelectionContext selection={selection} from={from} to={to} />
            )}
            {c.step === 'loading' && (
                <div aria-label={t('texts.collect.loading')}>
                    <Skeleton height={44} />
                    <Skeleton height={44} />
                </div>
            )}
            {c.step === 'signin' && (
                <>
                    <p>
                        {t('texts.collect.signinBody', {
                            term: selection.text,
                        })}
                    </p>
                    <Button
                        desktopIconOnly
                        fullWidth
                        leadingIcon={<LogIn size={16} />}
                        onClick={onRequireSignIn}
                    >
                        {t('texts.collect.continue')}
                    </Button>
                    <Button fullWidth variant='ghost' onClick={c.close}>
                        {t('texts.collect.keep')}
                    </Button>
                </>
            )}
            {c.step === 'pick' && (
                <>
                    <DictionaryChoices
                        c={c}
                        chosen={chosen}
                        setChosen={setChosen}
                        requestWithSession={requestWithSession}
                    />
                    <Button
                        desktopIconOnly
                        variant='ghost'
                        size='compact'
                        leadingIcon={<Plus size={16} />}
                        onClick={createDictionary}
                    >
                        {t('texts.collect.create')}
                    </Button>
                    <div className={styles.actions}>
                        <Button variant='secondary' onClick={c.close}>
                            {t('texts.collect.cancel')}
                        </Button>
                        <Button
                            desktopIconOnly
                            disabled={!selected || busy}
                            leadingIcon={<BookPlus size={16} />}
                            onClick={submit}
                        >
                            {t('texts.collect.addCard')}
                        </Button>
                    </div>
                    {busy && (
                        <p role='status'>
                            {t('texts.collect.adding', {
                                term: selection.text,
                            })}
                        </p>
                    )}
                    {!selected && c.dictionaries.length > 0 && (
                        <small>{t('texts.collect.hint')}</small>
                    )}
                </>
            )}
            {c.step === 'new' && (
                <NewDictionaryForm
                    name={name}
                    onNameChange={setName}
                    from={from}
                    to={to}
                    onBack={chooseDictionary}
                    onSubmit={submitNewDictionary}
                />
            )}
            {c.step === 'duplicate' && (
                <>
                    <p className={styles.warning}>
                        {t('texts.collect.duplicate')}
                    </p>
                    {c.duplicateTarget && (
                        <DuplicatePreview
                            dictionaryId={c.duplicateTarget}
                            term={selection.text}
                            requestWithSession={requestWithSession}
                        />
                    )}
                    <div className={styles.actions}>
                        <Button variant='secondary' onClick={c.chooseAgain}>
                            {t('texts.collect.chooseAgain')}
                        </Button>
                        <Button onClick={c.confirmDuplicate}>
                            {t('texts.collect.another')}
                        </Button>
                    </div>
                </>
            )}
            {c.step === 'error' && (
                <>
                    <p role='alert' className={styles.warning}>
                        <Info size={16} aria-hidden />
                        {t(
                            c.expired
                                ? 'texts.collect.expired'
                                : collectionFailureKey(c.failureCode),
                        )}
                    </p>
                    {!c.expired && (
                        <div className={styles.actions}>
                            <Button variant='secondary' onClick={c.chooseAgain}>
                                {t('texts.collect.chooseAgain')}
                            </Button>
                            <Button onClick={c.retry}>
                                {t('texts.collect.retry')}
                            </Button>
                        </div>
                    )}
                </>
            )}
            {c.step === 'adding' && (
                <>
                    <p role='status'>
                        {t('texts.collect.adding', { term: selection.text })}
                    </p>
                    <Button variant='secondary' onClick={cancel}>
                        {t('texts.collect.cancel')}
                    </Button>
                </>
            )}
            {c.step === 'success' && (
                <>
                    <p role='status'>
                        {t('texts.collect.success', { term: selection.text })}
                    </p>
                    {c.dictionaryId && (
                        <ButtonLink href={`/dictionaries/${c.dictionaryId}`}>
                            {t('texts.collect.open')}
                        </ButtonLink>
                    )}
                    <Button variant='ghost' onClick={c.close}>
                        {t('texts.collect.keep')}
                    </Button>
                </>
            )}
        </div>
    );
}
