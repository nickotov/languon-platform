'use client';
import { useState } from 'react';
import { useSessionStore } from '@/fsd/entities/session';
import { textsApi, type RequestWithTextSession } from '@/fsd/entities/texts';
import type { TextResource } from '../types';
import { useTextMutation } from './use-text-mutation';

// Capabilities are transient, account-scoped and never enter persisted/query state.
type TextShareCapability = Awaited<
    ReturnType<typeof textsApi.createTextShare>
>['capability'];
const capabilities = new Map<string, TextShareCapability>();
useSessionStore.subscribe((next, previous) => {
    if (next.user?.id !== previous.user?.id) capabilities.clear();
});
export function useTextShare(
    kind: 'text' | 'folder',
    resource: TextResource,
    request: RequestWithTextSession,
    onChanged?: () => void,
) {
    const owner = useSessionStore((state) => state.user?.id);
    const identity = `${owner ?? ''}:${kind}:${resource.id}`;
    const [saved, setSaved] = useState(() => ({
        identity,
        capability:
            resource.isShared === false
                ? undefined
                : capabilities.get(identity),
    }));
    const capability =
        saved.identity === identity ? saved.capability : undefined;
    function setCapability(value: TextShareCapability | undefined) {
        setSaved({ identity, capability: value });
    }
    const [step, setStep] = useState<'normal' | 'confirm' | 'revoked'>(
        'normal',
    );
    const [copied, setCopied] = useState(false);
    const mutation = useTextMutation(request);
    const path = capability
        ? `/shared/${kind === 'text' ? 'texts' : 'text-folders'}/${capability.shareId}#${capability.key}`
        : '';
    const url =
        path && typeof window !== 'undefined'
            ? new URL(path, window.location.origin).href
            : '';
    const active =
        step !== 'revoked' && Boolean(resource.isShared || capability);
    function create() {
        void mutation.run(
            (token) =>
                kind === 'text'
                    ? textsApi.createTextShare(token, resource.id, {
                          expectedVersion: resource.version,
                      })
                    : textsApi.createFolderShare(token, resource.id, {
                          expectedVersion: resource.version,
                      }),
            (value) => {
                capabilities.set(identity, value.capability);
                setCapability(value.capability);
                setStep('normal');
                onChanged?.();
            },
        );
    }
    function revoke() {
        void mutation.run(
            (token) =>
                kind === 'text'
                    ? textsApi.revokeTextShare(token, resource.id, {
                          expectedVersion: resource.version,
                      })
                    : textsApi.revokeFolderShare(token, resource.id, {
                          expectedVersion: resource.version,
                      }),
            () => {
                capabilities.delete(identity);
                setCapability(undefined);
                setStep('revoked');
                onChanged?.();
            },
        );
    }
    return {
        ...mutation,
        capability,
        step,
        setStep,
        copied,
        setCopied,
        path,
        url,
        active,
        create,
        revoke,
    };
}
