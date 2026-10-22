'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActionAllowanceQuoteSchema,
    type ActionAllowanceQuote,
} from '@languon/contracts';

export class ActionConsentCancelledError extends Error {
    constructor() {
        super('The action was not sent. Your input has been kept.');
    }
}

function actionQuote(error: unknown): ActionAllowanceQuote | null {
    const detail = (error as { detail?: unknown } | null)?.detail;
    if (
        !detail ||
        typeof detail !== 'object' ||
        !('code' in detail) ||
        detail.code !== 'action_confirmation_required'
    )
        return null;
    const details = 'details' in detail ? detail.details : null;
    const parsed = ActionAllowanceQuoteSchema.safeParse(
        details && typeof details === 'object' && 'quote' in details
            ? details.quote
            : undefined,
    );
    return parsed.success ? parsed.data : null;
}

/** Callers freeze the request and its idempotency identity before entering this loop. */
export function useActionConsent() {
    const [quote, setQuote] = useState<ActionAllowanceQuote | null>(null);
    const pending = useRef<{
        quote: ActionAllowanceQuote;
        resolve(id: string): void;
        reject(error: Error): void;
    } | null>(null);
    useEffect(
        () => () => {
            pending.current?.reject(new ActionConsentCancelledError());
            pending.current = null;
        },
        [],
    );

    const run = useCallback(
        async <T>(
            send: (confirmedQuoteId?: string) => Promise<T>,
        ): Promise<T> => {
            let confirmedQuoteId: string | undefined;
            for (;;) {
                try {
                    return await send(confirmedQuoteId);
                } catch (error) {
                    const offer = actionQuote(error);
                    if (!offer) throw error;
                    confirmedQuoteId = await new Promise<string>(
                        (resolve, reject) => {
                            pending.current?.reject(
                                new ActionConsentCancelledError(),
                            );
                            pending.current = { quote: offer, resolve, reject };
                            setQuote(offer);
                        },
                    );
                }
            }
        },
        [],
    );
    const confirm = useCallback(() => {
        const current = pending.current;
        if (!current || Date.parse(current.quote.expiresAt) <= Date.now())
            return;
        pending.current = null;
        setQuote(null);
        current.resolve(current.quote.id);
    }, []);
    const cancel = useCallback(() => {
        const current = pending.current;
        pending.current = null;
        setQuote(null);
        current?.reject(new ActionConsentCancelledError());
    }, []);
    return { run, quote, confirm, cancel };
}
export type ActionConsent = ReturnType<typeof useActionConsent>;
