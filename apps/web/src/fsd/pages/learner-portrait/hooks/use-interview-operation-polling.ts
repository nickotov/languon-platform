'use client';
import { useEffect } from 'react';
import {
    portraitApi,
    type PortraitSessionRequest,
} from '@/fsd/entities/learner-portrait';

import {
    isInterviewOwner,
    ownerScopedInterviewRequest,
} from '../lib/interview-owner';

/** A finite polling window reconnects to durable server work without restarting it. */
export function useInterviewOperationPolling({
    operationId,
    ownerId,
    revision,
    requestWithSession,
    load,
    onOperation,
    onBusy,
    onError,
}: {
    operationId: string | null;
    ownerId: string | null;
    revision: number;
    requestWithSession: PortraitSessionRequest;
    load(): Promise<void>;
    onOperation(id: string | null): void;
    onBusy(value: boolean): void;
    onError(value: string | null): void;
}) {
    useEffect(() => {
        if (!operationId || !isInterviewOwner(ownerId)) return;
        const request = ownerScopedInterviewRequest(
            ownerId,
            requestWithSession,
        );
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let attempts = 0;
        async function poll() {
            try {
                const operation = await request((token) =>
                    portraitApi.readOperation(
                        token,
                        operationId!,
                        controller.signal,
                    ),
                );
                if (controller.signal.aborted || !isInterviewOwner(ownerId))
                    return;
                if (!operation) throw new Error('Operation unavailable');
                if (
                    operation.state === 'queued' ||
                    operation.state === 'running'
                ) {
                    attempts += 1;
                    if (attempts >= 120) {
                        onError(
                            'The response is still running. Reconnect to check its status.',
                        );
                        onBusy(false);
                        return;
                    }
                    timer = setTimeout(poll, 2000);
                    return;
                }
                onOperation(null);
                onBusy(false);
                await load();
                if (operation.state !== 'succeeded')
                    onError(
                        operation.errorCode ??
                            'Response stopped. Your draft is unchanged.',
                    );
            } catch {
                if (controller.signal.aborted || !isInterviewOwner(ownerId))
                    return;
                onBusy(false);
                onError(
                    'Connection lost. Your interview is kept. Reconnect before sending again.',
                );
            }
        }
        void poll();
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [
        load,
        onBusy,
        onError,
        onOperation,
        operationId,
        ownerId,
        requestWithSession,
        revision,
    ]);
}
