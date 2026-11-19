import {
    ConversationApiError,
    conversationCopy,
} from '@/fsd/entities/conversation';
import { Button, ButtonLink, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { lessonRunCopy } from '../../lib/lesson-run-copy';
import type { LessonRunAction } from '../../types';

export function LessonActionNotice({
    error: actionError,
    kind,
    refresh,
}: {
    error: unknown;
    kind: LessonRunAction['kind'];
    refresh(): void;
}) {
    const { locale, href } = useI18n();
    const copy = lessonRunCopy(locale);

    const errorDetail =
        actionError instanceof ConversationApiError
            ? actionError.detail
            : undefined;
    const creditsExhausted = errorDetail?.code === 'credits_exhausted';
    const capacityMessages: Partial<Record<string, string>> = {
        capacity_unavailable: copy.serviceCapacity,
        provider_capacity_exhausted: copy.providerCapacity,
        operator_capacity_exhausted: copy.operatorCapacity,
    };
    const capacityMessage = errorDetail && capacityMessages[errorDetail.code];
    const errorCopy = conversationCopy(locale);
    const errorMessage = errorDetail
        ? ((
              {
                  credits_exhausted: errorCopy.creditsExhausted,
                  source_selection_required: copy.selectionRequired,
                  generation_scope_change: copy.capacity,
                  context_too_large: copy.inputTooLarge,
                  generation_acknowledgement_required: copy.reviewCurrent,
                  response_active: copy.turnActive,
                  version_conflict: copy.reviewCurrent,
                  action_budget_unconfigured: copy.authorityConfig,
              } as Record<string, string>
          )[errorDetail.code] ??
          capacityMessage ??
          copy.error)
        : copy.uncertainAction;
    const isGenerationAction = ['continue', 'revise'].includes(kind);
    const rejectedBeforeStarting =
        isGenerationAction &&
        actionError instanceof ConversationApiError &&
        ((actionError.status < 500 && actionError.status !== 408) ||
            (actionError.status === 503 && Boolean(capacityMessage)));

    return (
        <InlineAlert tone='error'>
            {rejectedBeforeStarting && <p>{copy.admissionRejected}</p>}
            <p>{errorMessage}</p>
            {errorDetail && (
                <p>
                    {errorDetail.code}
                    {errorDetail.correlationId !== 'lesson-run-client' &&
                        /^[a-z0-9_-]{1,100}$/iu.test(
                            errorDetail.correlationId,
                        ) &&
                        ` · ${copy.failureReference} ${errorDetail.correlationId}`}
                </p>
            )}
            {creditsExhausted ? (
                <ButtonLink
                    size='compact'
                    variant='secondary'
                    href={href('/profile?tab=credits')}
                >
                    {errorCopy.viewCredits}
                </ButtonLink>
            ) : capacityMessage ? null : (
                <Button size='compact' variant='ghost' onClick={refresh}>
                    {copy.refresh}
                </Button>
            )}
        </InlineAlert>
    );
}
