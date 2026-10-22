'use client';
import { useEffect, useState } from 'react';
import type { TextDocument, TextSelectionSource } from '@languon/contracts';
import { useAuth } from '@/fsd/features/auth';
import { useSessionStore } from '@/fsd/entities/session';
import { ActionBudgetSummary } from '@/fsd/features/text-ai-preferences';
import { TextReading } from '@/fsd/features/text-reading';
import { ContextualAssistant } from '@/fsd/widgets/contextual-assistant';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, ButtonLink, LoadingState, showToast } from '@/fsd/shared/ui';
import { useSharedText } from '../../hooks/use-shared-text';
import type { SharedCopyTarget } from '../../hooks/use-shared-text-copy';
import { PublicReaderHeader } from './reader-header';
import { PublicHeader } from './public-header';
import { PublicFolder } from './public-folder';
import { PublicUnavailable } from './unavailable';
import { PublicSignInDialog } from './sign-in-dialog';
import { PublicCopyDialog } from './copy-dialog';
import styles from './public-page.module.css';

export function SharedTextsPage({
    kind,
    shareId,
    textId,
}: {
    kind: 'text' | 'folder';
    shareId: string;
    textId?: string;
}) {
    const { href, t } = useI18n();
    const { requestWithSession } = useAuth();
    const signedIn = useSessionStore(
        (state) => state.status === 'authenticated',
    );
    const actor = useSessionStore(
        (state) =>
            `${state.status}:${state.user?.id ?? 'anonymous'}:${state.session?.id ?? ''}`,
    );
    const shared = useSharedText(kind, shareId);
    const [signIn, setSignIn] = useState(false);
    const [copy, setCopy] = useState<SharedCopyTarget | null>(null);
    useEffect(() => {
        setCopy(null);
    }, [actor]);
    const [match, setMatch] = useState(false);
    const [tab, setTab] = useState<'source' | 'translation'>('source');
    const basePath = `/shared/${kind === 'text' ? 'texts' : 'text-folders'}/${shareId}`;
    const returnTo = textId ? `${basePath}/texts/${textId}` : basePath;
    const text =
        kind === 'text'
            ? shared.texts[0]
            : shared.texts.find((item) => item.id === textId);
    const waitingForText = Boolean(textId && !text && shared.hasNextPage);
    useEffect(() => {
        if (
            waitingForText &&
            !shared.isFetchingNextPage &&
            !shared.isFetchNextPageError
        )
            void shared.fetchNextPage();
    }, [
        waitingForText,
        shared.isFetchingNextPage,
        shared.isFetchNextPageError,
        shared.fetchNextPage,
    ]);

    function openSignIn() {
        setSignIn(true);
    }

    function closeSignIn() {
        setSignIn(false);
    }

    function closeCopy() {
        setCopy(null);
    }

    function openCopyText(item: TextDocument) {
        if (!signedIn) {
            openSignIn();
            return;
        }
        setCopy({
            mode: 'text',
            textId: item.id,
            version: item.version,
            total: 1,
            defaultName: shared.folder?.name ?? item.title,
        });
    }

    function copyCurrent() {
        if (text) openCopyText(text);
    }

    function openCopyFolder() {
        if (!signedIn) {
            openSignIn();
            return;
        }
        if (shared.folder)
            setCopy({
                mode: 'folder',
                total: shared.folder.translatedCount ?? shared.texts.length,
                defaultName: shared.folder.name,
            });
    }

    function loadMore() {
        void shared.fetchNextPage();
    }

    function copied(folderId: string) {
        closeCopy();
        const action = (
            <ButtonLink
                href={href(folderId ? `/texts/folders/${folderId}` : '/texts')}
                size='compact'
                variant='quiet'
            >
                {folderId
                    ? t('texts.public.openFolder')
                    : t('texts.library.title')}
            </ButtonLink>
        );
        showToast({
            tone: 'success',
            content: t('texts.public.copied'),
            dismissLabel: t('texts.public.close'),
            action,
        });
    }

    const source: TextSelectionSource | null = text
        ? {
              kind: 'shared-text',
              shareId,
              textId: text.id,
              expectedTextVersion: text.version,
          }
        : null;
    const loading =
        shared.initializing || (Boolean(shared.shareKey) && shared.isPending);
    const unavailable =
        !loading &&
        (!shared.shareKey ||
            shared.isError ||
            !shared.data ||
            (kind === 'text' && !text) ||
            (Boolean(textId) && !text && !waitingForText));
    let content;
    if (loading)
        content = (
            <main className={styles.folder}>
                <LoadingState>{t('texts.public.loading')}</LoadingState>
            </main>
        );
    else if (unavailable) content = <PublicUnavailable />;
    else if (text)
        content = (
            <>
                <PublicReaderHeader
                    text={text}
                    folderName={
                        kind === 'folder' ? shared.folder?.name : undefined
                    }
                    backHref={`${basePath}#${shared.shareKey}`}
                    match={match}
                    onMatch={setMatch}
                    onCopy={copyCurrent}
                />
                <ContextualAssistant
                    source={{
                        kind: 'text',
                        id: text.id,
                        shareLocator: shareId,
                        shareKind: kind,
                    }}
                    shareKey={shared.shareKey}
                    contextLabel={text.title}
                    selectionRootId='shared-text-reading'
                />
                <div className={styles.reader} id='shared-text-reading'>
                    <TextReading
                        collectionBudgetContent={
                            signedIn ? (
                                <ActionBudgetSummary
                                    request={requestWithSession}
                                />
                            ) : undefined
                        }
                        collectionActorKey={actor}
                        document={text}
                        source={source}
                        shareKey={shared.shareKey}
                        {...(signedIn ? { requestWithSession } : {})}
                        matchMode={match}
                        tab={tab}
                        onTabChange={setTab}
                        showEditedMarkers={false}
                        onRequireSignIn={openSignIn}
                        topSlot={
                            !signedIn ? (
                                <p className={styles.notice}>
                                    {t('texts.public.hint')}
                                </p>
                            ) : undefined
                        }
                    />
                </div>
            </>
        );
    else if (shared.folder)
        content = (
            <>
                <PublicFolder
                    folder={shared.folder}
                    texts={shared.texts}
                    basePath={basePath}
                    shareKey={shared.shareKey}
                    onCopyFolder={openCopyFolder}
                    onCopyText={openCopyText}
                />
                {shared.hasNextPage && (
                    <div className={styles.more}>
                        <Button
                            onClick={loadMore}
                            loading={shared.isFetchingNextPage}
                        >
                            {t('texts.public.more')}
                        </Button>
                    </div>
                )}
            </>
        );
    else content = <PublicUnavailable />;
    if (waitingForText)
        content = (
            <main className={styles.folder}>
                <Button onClick={loadMore} loading={shared.isFetchingNextPage}>
                    {t('texts.public.more')}
                </Button>
            </main>
        );

    return (
        <div className={styles.page}>
            <PublicHeader
                signedIn={signedIn}
                onSignIn={openSignIn}
                minimal={unavailable}
            />
            {content}
            <PublicSignInDialog
                open={signIn}
                onClose={closeSignIn}
                returnTo={returnTo}
                shareKey={shared.shareKey}
            />
            {copy && signedIn && (
                <PublicCopyDialog
                    key={actor}
                    target={copy}
                    kind={kind}
                    shareId={shareId}
                    shareKey={shared.shareKey}
                    requestWithSession={requestWithSession}
                    onClose={closeCopy}
                    onDone={copied}
                />
            )}
        </div>
    );
}
