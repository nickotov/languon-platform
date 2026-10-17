'use client';
import { useEffect, useRef, useState } from 'react';
import type {
    DictionarySummary,
    TextSelectionRequest,
    TextSelectionTarget,
} from '@languon/contracts';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import type { ReadingSelection, TextReadingProps } from '../types';
import { useCollectionJobs, type CollectionTask } from './use-collection-jobs';

export type CollectStep =
    | 'closed'
    | 'trigger'
    | 'pick'
    | 'new'
    | 'loading'
    | 'duplicate'
    | 'signin'
    | 'error'
    | 'adding'
    | 'success';

export function useCollect(props: TextReadingProps) {
    const [selection, setSelection] = useState<ReadingSelection | null>(null);
    const [step, setStep] = useState<CollectStep>('closed');
    const [dictionaries, setDictionaries] = useState<DictionarySummary[]>([]);
    const [dictionaryId, setDictionaryId] = useState<string | null>(null);
    const [failureCode, setFailureCode] = useState<string | null>(null);
    const [marks, setMarks] = useState<ReadingSelection[]>([]);
    const operation = useRef<TextSelectionRequest | null>(null);
    const active = useRef<AbortController | null>(null);
    const jobs = useCollectionJobs(props, (task) => {
        if (task.state === 'success')
            setMarks((previous) => [...previous, task.selection]);
        if (operation.current?.operationId !== task.body.operationId) return;
        setDictionaryId(task.dictionaryId);
        setFailureCode(task.failureCode);
        setStep(task.state);
    });

    useEffect(
        () => () => active.current?.abort(),
        [props.collectionActorKey, props.shareKey, props.requestWithSession],
    );
    const direction =
        selection?.selection.side === 'translation'
            ? ([
                  props.document.targetLanguage,
                  props.document.sourceLanguage,
              ] as const)
            : ([
                  props.document.sourceLanguage,
                  props.document.targetLanguage,
              ] as const);

    const close = () => {
        setStep('closed');
        setSelection(null);
        operation.current = null;
    };

    const onSelection = (value: ReadingSelection | null) => {
        if (!['closed', 'trigger', 'success', 'adding'].includes(step)) return;
        if (!value && step === 'adding') return;
        setSelection(value);
        setStep(value ? 'trigger' : 'closed');
        operation.current = null;
    };

    const load = async () => {
        if (!props.requestWithSession) {
            setStep('signin');
            return;
        }
        active.current?.abort();
        const control = new AbortController();
        active.current = control;
        setStep('loading');
        try {
            const all: DictionarySummary[] = [];
            let cursor: string | undefined;
            do {
                const response = await props.requestWithSession((token) =>
                    dictionaryApi.listDictionaries(
                        token,
                        {
                            lifecycle: 'active',
                            limit: 100,
                            ...(cursor ? { cursor } : {}),
                        },
                        control.signal,
                    ),
                );
                if (control.signal.aborted) return;
                all.push(...response.data);
                cursor = response.nextCursor ?? undefined;
            } while (cursor);
            setDictionaries(
                all.filter(
                    (item) =>
                        item.sourceLanguage === direction[0] &&
                        item.targetLanguage === direction[1],
                ),
            );
            setStep('pick');
        } catch {
            if (!control.signal.aborted) setStep('error');
        }
    };

    const isInflight = (target: TextSelectionTarget) =>
        jobs.tasks.some(
            (task) =>
                task.state === 'adding' &&
                task.selection.selection.pairId ===
                    selection?.selection.pairId &&
                task.selection.selection.side === selection?.selection.side &&
                task.selection.selection.startOffset ===
                    selection?.selection.startOffset &&
                task.selection.selection.endOffset ===
                    selection?.selection.endOffset &&
                JSON.stringify(task.body.target) === JSON.stringify(target),
        );

    const retryOperation = (task: CollectionTask) => {
        const body = task.terminal
            ? { ...task.body, operationId: crypto.randomUUID() }
            : task.body;
        if (task.terminal) jobs.dismiss(task.body.operationId);
        operation.current = body;
        setSelection(task.selection);
        setStep('adding');
        void jobs.run(body, task.selection);
    };

    const submit = (target: TextSelectionTarget, confirmDuplicate = false) => {
        if (
            step === 'adding' ||
            !selection ||
            !props.source ||
            selection.kind !== 'valid'
        )
            return;
        if (isInflight(target)) return;
        if (props.previewExpired) {
            setFailureCode('generation_proposal_expired');
            setStep('error');
            return;
        }
        const prior = operation.current;
        const body =
            prior && !confirmDuplicate
                ? prior
                : {
                      operationId: crypto.randomUUID(),
                      source: props.source,
                      selection: selection.selection,
                      target,
                      confirmDuplicate,
                  };
        operation.current = body;
        setStep('adding');
        void jobs.run(body, selection);
    };

    const restore = (task: CollectionTask) => {
        operation.current = task.body;
        setSelection(task.selection);
        setFailureCode(task.failureCode);
        setStep(task.state);
    };

    return {
        step,
        selection,
        dictionaries,
        dictionaryId,
        direction,
        failureCode,
        duplicateTarget:
            operation.current?.target.kind === 'existing'
                ? operation.current.target.dictionaryId
                : null,
        expired: failureCode === 'generation_proposal_expired',
        marks,
        pendingMarks: jobs.tasks
            .filter((task) => task.state === 'adding')
            .map((task) => task.selection),
        tasks: jobs.tasks,
        dismissTask: jobs.dismiss,
        cancelTask: jobs.cancel,
        restoreTask: restore,
        retryTask: retryOperation,
        isInflight,
        onSelection,
        close,
        open: load,
        setStep,
        submit,
        retry: () => {
            const task = jobs.tasks.find(
                (item) =>
                    item.body.operationId === operation.current?.operationId,
            );
            if (task) retryOperation(task);
            else if (operation.current && selection) {
                setStep('adding');
                void jobs.run(operation.current, selection);
            } else void load();
        },
        confirmDuplicate: () => {
            if (operation.current) {
                jobs.dismiss(operation.current.operationId);
                submit(operation.current.target, true);
            }
        },
        chooseAgain: () => {
            if (operation.current) jobs.dismiss(operation.current.operationId);
            operation.current = null;
            void load();
        },
        cancel: async () => {
            const task = jobs.tasks.find(
                (item) =>
                    item.body.operationId === operation.current?.operationId,
            );
            if (task) await jobs.cancel(task);
            setStep('pick');
            operation.current = null;
        },
    };
}

export type CollectController = ReturnType<typeof useCollect>;
