import Link from 'next/link';
import { Clock3, RefreshCw, Sparkles, Zap, X } from 'lucide-react';
import { TextsApiError } from '@/fsd/entities/texts';
import { Button } from '@/fsd/shared/ui';
import type { TextWorkspace } from '../../hooks/use-text-workspace';
import { useWorkspaceCopy } from './workspace-copy';
import styles from './workspace-page.module.css';
export function WorkspaceBanners({
    ws,
    onShorten,
}: {
    ws: TextWorkspace;
    onShorten?: () => void;
}) {
    const { copy } = useWorkspaceCopy();
    function retry() {
        void ws.translate();
    }
    function cancel() {
        void ws.translation.cancel().catch(() => undefined);
    }
    const code =
        ws.translation.job?.failureCode ??
        (ws.translation.error instanceof TextsApiError
            ? ws.translation.error.detail.code
            : '');
    const capacity = code.includes('capacity');
    const credits = code.includes('credit');
    let failure = copy('jobFailed');
    if (capacity) failure = copy('capacity');
    else if (credits) failure = copy('credits');
    else if (code.includes('unavailable')) failure = copy('unavailable');
    const failed = Boolean(
        ws.translation.error || ws.translation.job?.state === 'failed',
    );
    const queued =
        ws.translation.job?.state === 'queued' || ws.translation.pending;
    return (
        <div className={styles.banners}>
            {ws.translation.active && (
                <section className={styles.panel} role='status'>
                    <h2>
                        {queued ? <Clock3 /> : <Sparkles />}
                        {queued ? copy('queued') : copy('running')}
                    </h2>
                    <p>{copy('jobHint')}</p>
                    <div className={styles.progress} aria-hidden />
                    <Button variant='secondary' onClick={cancel}>
                        {copy('cancelJob')}
                    </Button>
                </section>
            )}
            {failed && (
                <section className={styles.panel} role='alert'>
                    <p>{failure}</p>
                    <Button
                        variant='ghost'
                        onClick={ws.translation.clear}
                        aria-label={copy('dismissError')}
                    >
                        <X />
                    </Button>
                    {capacity && (
                        <Button
                            variant='secondary'
                            onClick={onShorten ?? ws.shortenSource}
                        >
                            {copy('shorten')}
                        </Button>
                    )}
                    {(capacity || credits) && (
                        <Link href='/preferences'>
                            <Zap />
                            {copy('preferences')}
                        </Link>
                    )}
                    <Button
                        variant='secondary'
                        onClick={retry}
                        leadingIcon={<RefreshCw />}
                    >
                        {copy('retry')}
                    </Button>
                </section>
            )}
            {ws.proposal && (
                <section className={styles.panel} role='status'>
                    <h2>
                        {ws.previewExpired
                            ? copy('expired')
                            : ws.document?.alignment
                              ? copy('proposal')
                              : copy('preview')}
                    </h2>
                    <p>
                        {ws.document?.alignment
                            ? copy('proposalHint')
                            : copy('previewHint')}
                    </p>
                    {ws.previewExpired && (
                        <Button onClick={retry} leadingIcon={<RefreshCw />}>
                            {copy('regenerate')}
                        </Button>
                    )}
                </section>
            )}
            {Boolean(ws.saveError) && (
                <p className={styles.error} role='alert'>
                    {copy('saveError')}
                </p>
            )}
            {ws.showErrors && ws.mode === 'compose' && (
                <p className={styles.error} role='alert'>
                    {copy('invalid')}
                </p>
            )}
            {ws.document?.status === 'edited' &&
                ws.mode === 'read' &&
                !ws.proposal && (
                    <p className={styles.panel}>{copy('edited')}</p>
                )}
        </div>
    );
}
