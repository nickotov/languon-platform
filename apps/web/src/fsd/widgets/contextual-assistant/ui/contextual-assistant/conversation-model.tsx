import { useQuery } from '@tanstack/react-query';
import {
    conversationApi,
    conversationCopy,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { ButtonLink } from '@/fsd/shared/ui';
import styles from './contextual-assistant.module.css';

export function ConversationModel({
    actorId,
    request,
}: {
    actorId: string;
    request: ConversationSessionRequest;
}) {
    const { locale, href } = useI18n();
    const copy = conversationCopy(locale);
    const query = useQuery({
        queryKey: ['conversation-model', actorId],
        queryFn: ({ signal }) =>
            request((token) =>
                conversationApi.readModelPreference(token, signal),
            ),
        retry: false,
    });
    const preference = query.data;
    let label = copy.loading;
    if (query.isError) label = copy.error;
    if (preference?.mode === 'auto')
        label = `${copy.automatic} · DeepSeek Flash`;
    if (preference?.mode === 'explicit')
        label =
            preference.selectedModel?.label ?? preference.modelId ?? copy.error;
    return (
        <p className={styles.notice}>
            {copy.model}:{' '}
            <ButtonLink href={href('/profile')} variant='quiet' size='compact'>
                {label}
            </ButtonLink>
        </p>
    );
}
