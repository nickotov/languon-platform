import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PortraitState } from '@languon/contracts';
import {
    portraitApi,
    setPortraitStateCache,
    invalidatePortraitInterviewStatusCache,
} from '@/fsd/entities/learner-portrait';
import { useSessionStore } from '@/fsd/entities/session';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Dialog, DialogActions, InlineAlert } from '@/fsd/shared/ui';
import type { PortraitManagement } from '../../hooks/use-portrait-management';
import { portraitCopy } from '../../lib/copy';

export function RestartInterviewDialog({
    open,
    onClose,
    management,
}: {
    open: boolean;
    onClose(): void;
    management: PortraitManagement;
}) {
    const { locale } = useI18n();
    const router = useRouter();
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);
    const [discarded, setDiscarded] = useState<PortraitState | null>(null);
    const interviewLocale =
        management.status.data?.interview?.locale ??
        management.query.data?.draft?.locale ??
        locale;
    function close() {
        if (pending) return;
        if (discarded && management.ownerId) {
            setPortraitStateCache(
                management.client,
                management.ownerId,
                discarded,
            );
            void invalidatePortraitInterviewStatusCache(
                management.client,
                management.ownerId,
            );
            router.push('/portrait/intro?restart=failed');
        }
        onClose();
    }
    async function restart() {
        if (pending || !management.ownerId || !management.query.data) return;
        const ownerId = management.ownerId;
        setPending(true);
        setFailed(false);
        try {
            const next =
                discarded ??
                (await management.requestWithSession((token) =>
                    portraitApi.discard(token, {
                        expectedVersion: management.query.data!.version,
                    }),
                ));
            if (useSessionStore.getState().user?.id !== ownerId) return;
            setDiscarded(next);
            await management.requestWithSession((token) =>
                portraitApi.startInterview(token, {
                    expectedVersion: next.version,
                    locale: interviewLocale,
                }),
            );
            if (useSessionStore.getState().user?.id !== ownerId) return;
            setPortraitStateCache(management.client, ownerId, next);
            await invalidatePortraitInterviewStatusCache(
                management.client,
                ownerId,
            );
            router.push('/portrait/interview');
        } catch {
            setFailed(true);
        } finally {
            setPending(false);
        }
    }
    return (
        <Dialog
            open={open}
            onClose={close}
            size='sm'
            title={portraitCopy(locale, 'restartTitle')}
            description={portraitCopy(locale, 'restartBody')}
            dismissible={!pending}
            footer={
                <DialogActions>
                    <Button
                        variant='secondary'
                        onClick={close}
                        disabled={pending}
                    >
                        {portraitCopy(locale, 'cancel')}
                    </Button>
                    <Button
                        variant='danger'
                        onClick={restart}
                        loading={pending}
                    >
                        {portraitCopy(locale, 'restart')}
                    </Button>
                </DialogActions>
            }
        >
            {failed && (
                <InlineAlert tone='error'>
                    {portraitCopy(
                        locale,
                        discarded ? 'restartFailed' : 'actionError',
                    )}
                </InlineAlert>
            )}
        </Dialog>
    );
}
