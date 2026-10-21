'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
    PortraitInterviewCompletedOperation,
    StartPortraitInterviewResponse,
} from '@languon/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
    portraitApi,
    setPortraitStateCache,
    usePortraitState,
} from '@/fsd/entities/learner-portrait';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import {
    isInterviewOwner,
    ownerScopedInterviewRequest,
} from '../lib/interview-owner';
import type { z } from 'zod';
import { useInterviewLocale } from './use-interview-locale';
import { useInterviewProposalDraft } from './use-interview-proposal-draft';
import { useInterviewOperationPolling } from './use-interview-operation-polling';
import type { PortraitInterviewSubmissionSchema } from '@languon/contracts';

type Submission = z.infer<typeof PortraitInterviewSubmissionSchema>;

/** Durable operation handles stay on the server; closing this view only stops polling. */
export function usePortraitInterview() {
    const user = useSessionStore((state) => state.user);
    const { requestWithSession } = useAuth();
    const { locale } = useI18n();
    const queryClient = useQueryClient();
    const state = usePortraitState({
        ownerId: user?.id ?? null,
        requestWithSession,
    });
    const [session, setSession] =
        useState<StartPortraitInterviewResponse | null>(null);
    const [busy, setBusy] = useState(false);
    const [missing, setMissing] = useState(false);
    const [sessionOwner, setSessionOwner] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState(false);
    const [proposal, setProposal] =
        useState<PortraitInterviewCompletedOperation | null>(null);
    const [pollRevision, setPollRevision] = useState(0);
    const [operationId, setOperationId] = useState<string | null>(null);
    const pending = useRef<{ input: Submission; key: string } | null>(null);
    const alive = useRef(true);
    const paidAcknowledged = useRef(false);
    const loadSequence = useRef(0);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    useEffect(() => {
        pending.current = null;
        paidAcknowledged.current = false;
        setNotice(false);
        setOperationId(null);
        setBusy(false);
        setProposal(null);
    }, [user?.id]);

    const load = useCallback(async () => {
        const ownerId = user?.id ?? null;
        if (!isInterviewOwner(ownerId)) return;
        const request = ownerScopedInterviewRequest(
            ownerId,
            requestWithSession,
        );
        const sequence = ++loadSequence.current;
        const current = await request((token) => portraitApi.read(token));
        const status = await request((token) =>
            portraitApi.readInterviewStatus(token),
        );
        if (!status.interview) {
            if (alive.current && sequence === loadSequence.current) {
                setMissing(true);
                setSession(null);
                setOperationId(null);
                setBusy(false);
            }
            return;
        }
        const next = await request((token) =>
            portraitApi.startInterview(token, {
                expectedVersion: current.version,
                locale,
            }),
        );
        if (!alive.current || sequence !== loadSequence.current) return;
        if (next.creditsBypass) paidAcknowledged.current = false;
        if (user) setPortraitStateCache(queryClient, user.id, current);
        setMissing(false);
        setSessionOwner(user?.id ?? null);
        setSession(next);
        setProposal(next.latestCompletedOperation ?? null);
        const cancelling = next.activeOperation?.state === 'cancelled';
        setOperationId(cancelling ? null : (next.activeOperation?.id ?? null));
        setBusy(Boolean(next.activeOperation) && !cancelling);
        setError(
            cancelling
                ? 'Stopped. Cleanup is finishing. Reconnect before sending again.'
                : null,
        );
    }, [locale, queryClient, requestWithSession, user]);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        load().catch(() => {
            if (!cancelled && isInterviewOwner(user.id))
                setError(
                    'Unable to open the interview. Your saved work has been kept.',
                );
        });
        return () => {
            cancelled = true;
        };
    }, [load, user]);

    useInterviewOperationPolling({
        operationId,
        ownerId: sessionOwner,
        revision: pollRevision,
        requestWithSession,
        load,
        onOperation: setOperationId,
        onBusy: setBusy,
        onError: setError,
    });

    async function submit(input: Submission, acknowledged = false) {
        if (
            !session ||
            sessionOwner !== user?.id ||
            !isInterviewOwner(sessionOwner) ||
            busy ||
            operationId
        )
            return false;
        const request = ownerScopedInterviewRequest(
            sessionOwner,
            requestWithSession,
        );
        const staged =
            pending.current &&
            JSON.stringify(pending.current.input) === JSON.stringify(input)
                ? pending.current
                : { input, key: crypto.randomUUID() };
        pending.current = staged;
        setBusy(true);
        setError(null);
        try {
            const current = await request((token) => portraitApi.read(token));
            const operation = await request((token) =>
                portraitApi.submitInterview(token, {
                    interviewId: session.interviewId,
                    expectedVersion: current.version,
                    expectedGeneration: current.generation,
                    idempotencyKey: staged.key,
                    input: staged.input,
                    paidAcknowledged: acknowledged || paidAcknowledged.current,
                }),
            );
            if (!alive.current || !isInterviewOwner(sessionOwner)) return false;
            if (acknowledged) paidAcknowledged.current = true;
            pending.current = null;
            setNotice(false);
            setOperationId(operation.id);
            return true;
        } catch (cause) {
            if (!alive.current || !isInterviewOwner(sessionOwner)) return false;
            setBusy(false);
            const code = (cause as { code?: string }).code;
            if (code === 'billing_notice_required') {
                setSession((previous) =>
                    previous ? { ...previous, creditsBypass: false } : previous,
                );
                setNotice(true);
                return false;
            }
            setError(code ?? 'Unable to send. Your text and draft are kept.');
            return false;
        }
    }
    async function confirmCost() {
        if (pending.current) await submit(pending.current.input, true);
    }
    function cancelCost() {
        setNotice(false);
        pending.current = null;
    }
    async function reconnect() {
        const ownerId = user?.id ?? null;
        if (!isInterviewOwner(ownerId)) return;
        setError(null);
        setBusy(Boolean(operationId));
        setPollRevision((value) => value + 1);
        try {
            await load();
        } catch {
            if (!isInterviewOwner(ownerId)) return;
            setError('Unable to reconnect. Your unfinished work is kept.');
        }
    }
    async function stop() {
        if (!operationId || !isInterviewOwner(sessionOwner)) return;
        const ownerId = sessionOwner;
        const request = ownerScopedInterviewRequest(
            ownerId,
            requestWithSession,
        );
        try {
            await request((token) =>
                portraitApi.stopOperation(token, operationId),
            );
            await reconnect();
        } catch {
            if (!isInterviewOwner(ownerId)) return;
            setError(
                'Unable to confirm stop. Reconnect to check the response.',
            );
        }
    }
    const switchLocale = useInterviewLocale({
        ownerId: sessionOwner,
        session,
        requestWithSession,
        onSession: setSession,
        onError: setError,
    });
    const acceptProposal = useInterviewProposalDraft({
        ownerId: user?.id ?? null,
        proposal,
        locale: session?.context.locale ?? locale,
        requestWithSession,
        onProposal: setProposal,
        onSession: setSession,
        onError: setError,
    });
    function dismissProposal() {
        setProposal(null);
    }
    return {
        session: sessionOwner === user?.id ? session : null,
        missing,
        state,
        busy,
        error,
        notice,
        proposal,
        submit,
        confirmCost,
        cancelCost,
        reconnect,
        stop,
        switchLocale,
        acceptProposal,
        dismissProposal,
    };
}
