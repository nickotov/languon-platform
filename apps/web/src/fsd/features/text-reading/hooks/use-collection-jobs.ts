'use client';
import { useEffect, useRef, useState } from 'react';
import type { TextSelectionRequest } from '@languon/contracts';
import { textsApi, TextsApiError } from '@/fsd/entities/texts';
import { waitForPoll } from '../lib/wait-for-poll';
import type { ReadingSelection, TextReadingProps } from '../types';

export interface CollectionTask {
    body: TextSelectionRequest;
    selection: ReadingSelection;
    state: 'adding' | 'success' | 'error' | 'duplicate';
    jobId: string | null;
    dictionaryId: string | null;
    failureCode: string | null;
    terminal: boolean;
}

export function useCollectionJobs(
    props: TextReadingProps,
    onResult: (task: CollectionTask) => void,
) {
    const [tasks, setTasks] = useState<CollectionTask[]>([]);
    const controls = useRef(new Map<string, AbortController>());
    const results = useRef(new Map<string, CollectionTask>());
    const notify = useRef(onResult);
    notify.current = onResult;

    useEffect(() => {
        const map = controls.current;
        return () => {
            map.forEach((control) => control.abort());
            map.clear();
        };
    }, [props.collectionActorKey, props.requestWithSession, props.shareKey]);

    const update = (task: CollectionTask) => {
        results.current.set(task.body.operationId, task);
        setTasks([...results.current.values()]);
    };

    const run = async (
        body: TextSelectionRequest,
        selection: ReadingSelection,
    ) => {
        if (!props.requestWithSession || controls.current.has(body.operationId))
            return;
        const control = new AbortController();
        controls.current.set(body.operationId, control);
        const previous = results.current.get(body.operationId);
        let task: CollectionTask = {
            body,
            selection,
            state: 'adding',
            jobId: previous?.jobId ?? null,
            dictionaryId: null,
            failureCode: null,
            terminal: false,
        };
        update(task);
        try {
            let response = task.jobId
                ? await props.requestWithSession((token) =>
                      textsApi.getSelectionJob(
                          token,
                          task.jobId!,
                          control.signal,
                      ),
                  )
                : await props.requestWithSession((token) =>
                      textsApi.enqueueSelection(
                          token,
                          body,
                          props.shareKey,
                          control.signal,
                      ),
                  );
            if (control.signal.aborted) return;
            task = { ...task, jobId: response.job.id };
            update(task);
            while (
                response.job.state === 'queued' ||
                response.job.state === 'running'
            ) {
                await waitForPoll(control.signal);
                if (control.signal.aborted) return;
                response = await props.requestWithSession((token) =>
                    textsApi.getSelectionJob(
                        token,
                        response.job.id,
                        control.signal,
                    ),
                );
            }
            if (control.signal.aborted) return;
            let state: CollectionTask['state'] = 'error';
            if (response.job.state === 'completed') state = 'success';
            else if (
                response.job.failureCode === 'duplicate_confirmation_required'
            )
                state = 'duplicate';

            task = {
                ...task,
                state,
                dictionaryId: response.job.dictionaryId,
                failureCode: response.job.failureCode,
                terminal: true,
            };
        } catch (error) {
            if (control.signal.aborted) return;
            const code =
                error instanceof TextsApiError ? error.detail.code : null;
            task = {
                ...task,
                state:
                    code === 'duplicate_confirmation_required'
                        ? 'duplicate'
                        : 'error',
                failureCode: code,
            };
        } finally {
            controls.current.delete(body.operationId);
        }
        if (control.signal.aborted) return;
        update(task);
        notify.current(task);
    };

    const dismiss = (id: string) => {
        results.current.delete(id);
        setTasks([...results.current.values()]);
    };

    const cancel = async (task: CollectionTask) => {
        const control = controls.current.get(task.body.operationId);
        if (!task.jobId || !props.requestWithSession || !control) return;
        try {
            const response = await props.requestWithSession((token) =>
                textsApi.cancelSelectionJob(token, task.jobId!, control.signal),
            );
            if (control.signal.aborted || response.job.state === 'completed')
                return;
            controls.current.get(task.body.operationId)?.abort();
            controls.current.delete(task.body.operationId);
            dismiss(task.body.operationId);
        } catch {
            if (!control.signal.aborted) update({ ...task, state: 'error' });
        }
    };

    return { tasks, run, dismiss, cancel };
}
