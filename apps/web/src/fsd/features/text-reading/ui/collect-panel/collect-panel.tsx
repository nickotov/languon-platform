'use client';
import { useState } from 'react';
import { collectionFailureKey } from '../../lib/collection-failure';
import { DuplicatePreview } from './duplicate-preview';
import { DictionaryChoices } from './dictionary-choices';
import type { RequestWithTextSession } from '@/fsd/entities/texts';
import {
    ArrowLeft,
    ArrowRight,
    BookPlus,
    Info,
    LogIn,
    Plus,
    Sparkles,
} from 'lucide-react';
import { Button, ButtonLink, Input, Skeleton } from '@/fsd/shared/ui';
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
    const offset = selection.selection.startOffset - selection.sentenceStart;
    return (
        <div className={styles.panel}>
            {c.step !== 'signin' && (
                <div className={styles.context}>
                    <div className={styles.contextHeader}>
                        <strong>
                            {t('texts.collect.card', { from, to })}
                            <ArrowRight size={12} aria-hidden />
                        </strong>
                        <span>
                            <Sparkles size={12} aria-hidden />
                            {t('texts.collect.context')}
                        </span>
                    </div>
                    <p lang={selection.selection.side === 'source' ? from : to}>
                        {selection.sentence.slice(
                            Math.max(0, offset - 70),
                            offset,
                        )}
                        <mark>{selection.text}</mark>
                        {selection.sentence.slice(
                            offset + selection.text.length,
                            offset + selection.text.length + 70,
                        )}
                    </p>
                </div>
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
                        variant='ghost'
                        size='compact'
                        leadingIcon={<Plus size={16} />}
                        onClick={() => c.setStep('new')}
                    >
                        {t('texts.collect.create')}
                    </Button>
                    <div className={styles.actions}>
                        <Button variant='secondary' onClick={c.close}>
                            {t('texts.collect.cancel')}
                        </Button>
                        <Button
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
                <form
                    className={styles.form}
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (name.trim())
                            c.submit({ kind: 'new', name: name.trim() });
                    }}
                >
                    <Input
                        label={t('texts.collect.name')}
                        required
                        autoFocus
                        maxLength={80}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                    <small>{t('texts.collect.atomic', { from, to })}</small>
                    <div className={styles.actions}>
                        <Button
                            type='button'
                            variant='ghost'
                            leadingIcon={<ArrowLeft size={16} />}
                            onClick={() => c.setStep('pick')}
                        >
                            {t('texts.collect.back')}
                        </Button>
                        <Button
                            type='submit'
                            leadingIcon={<BookPlus size={16} />}
                        >
                            {t('texts.collect.createAdd')}
                        </Button>
                    </div>
                </form>
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
                    <Button variant='secondary' onClick={() => void c.cancel()}>
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
