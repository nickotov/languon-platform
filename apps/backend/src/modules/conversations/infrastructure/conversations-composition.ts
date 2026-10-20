import type { AccessTokenSigner } from '../../authentication/application/ports/access-token';
import type { AuthenticationService } from '../../authentication/application/authentication-service';
import type { AuthHttpPolicy } from '../../authentication/interface/http/auth-http-policy';
import type {
    RateLimiter,
    ConcurrentRequestLimiter,
} from '../../authentication/application/ports/rate-limiter';
import {
    HmacDictionaryCryptography,
    type DictionaryEntropySource,
} from '../../dictionaries/infrastructure/crypto/dictionary-cryptography';
import { createTextsCryptography } from '../../texts/infrastructure/texts-composition';
import { DrizzleKnowledgeTransactionParticipant } from '../../knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import { ConversationService } from '../application/conversation-service';
import { ConversationWorkerService } from '../application/conversation-worker-service';
import type { ClaimedConversationTurn } from '../application/ports/conversation-store';
import type { TutorRunner } from '../application/ports/tutor-runner';
import { ConversationSourceResolver } from './persistence/drizzle/conversation-source';
import {
    DrizzleConversationStore,
    type ConversationPersistenceDependencies,
} from './persistence/drizzle/drizzle-conversation-store';
import { createConversationRoutes } from '../interface/http/conversation.routes';
import type { WorkspaceContextLimits } from '../application/workspace-turn-context';
export interface ConversationsCompositionDependencies extends Pick<
    ConversationPersistenceDependencies,
    'database' | 'admitTurn' | 'settleInterrupted'
> {
    accessTokens: AccessTokenSigner;
    authentication: Pick<AuthenticationService, 'requireActiveSession'>;
    rateLimiter: RateLimiter & ConcurrentRequestLimiter;
    policy: AuthHttpPolicy;
    dictionaryHmacSecret: string | Uint8Array;
    entropy: DictionaryEntropySource;
    clock: { now(): Date };
    workspaceContextLimits?: WorkspaceContextLimits;
    createRunner?: (
        store: DrizzleConversationStore,
        turn: ClaimedConversationTurn,
    ) => TutorRunner | Promise<TutorRunner>;
}
export function createConversationsComposition(
    dependencies: ConversationsCompositionDependencies,
) {
    const dictionary = new HmacDictionaryCryptography({
        secret: dependencies.dictionaryHmacSecret,
        entropy: dependencies.entropy,
    });
    const text = createTextsCryptography(
        dependencies.dictionaryHmacSecret,
        dependencies.entropy,
    );
    const sources = new ConversationSourceResolver({
        verifyDictionaryShare: (key, digest) =>
            dictionary.verifyShare(key, digest),
        verifyTextShare: (key, digest) => text.verifyShare(key, digest),
        readNote: (tx, ownerId, id) =>
            new DrizzleKnowledgeTransactionParticipant(tx).getForSource(
                ownerId,
                id,
            ),
    });
    const store = new DrizzleConversationStore({
        database: dependencies.database,
        sources,
        ...(dependencies.workspaceContextLimits
            ? { workspaceContextLimits: dependencies.workspaceContextLimits }
            : {}),
        nameUntitledNote: (tx, ownerId, noteId, title) =>
            new DrizzleKnowledgeTransactionParticipant(
                tx,
            ).nameUntitledFromFirstMessage(ownerId, noteId, title),
        now: () => dependencies.clock.now(),
        admitTurn: dependencies.admitTurn,
        publishNote: (tx, ownerId, input) =>
            new DrizzleKnowledgeTransactionParticipant(tx).publish(
                ownerId,
                input,
                dependencies.clock.now(),
            ),
        ...(dependencies.settleInterrupted
            ? { settleInterrupted: dependencies.settleInterrupted }
            : {}),
    });
    const service = new ConversationService(
        store,
        async (token) => {
            const claims = await dependencies.accessTokens.verify(token);
            await dependencies.authentication.requireActiveSession({
                userId: claims.userId,
                sessionId: claims.sessionId,
            });
            return { userId: claims.userId };
        },
        dependencies.rateLimiter,
        dependencies.rateLimiter,
    );
    const factory = dependencies.createRunner;
    return {
        store,
        service,
        routes: createConversationRoutes({
            service,
            policy: dependencies.policy,
        }),
        worker: factory
            ? new ConversationWorkerService({
                  store,
                  createRunner: (turn) => factory(store, turn),
              })
            : undefined,
    };
}
