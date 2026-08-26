export type DictionaryLifecycle = 'active' | 'archived';
export type DictionaryVisibility = 'private' | 'unlisted';
export type CardLifecycle = 'active' | 'archived';

export interface ShareCapabilityMetadata {
    keyDigest: string;
    keyVersion: number;
    locator: string;
    rotatedAt: Date;
}

export interface DictionaryAccessState {
    archivedAt: Date | null;
    lifecycle: DictionaryLifecycle;
    share: ShareCapabilityMetadata | null;
    visibility: DictionaryVisibility;
}

export interface CardLifecycleState {
    archivedAt: Date | null;
    lifecycle: CardLifecycle;
}

export class InvalidDictionaryLifecycleError extends Error {
    public constructor(
        public readonly reason:
            | 'archive_timestamp'
            | 'archived_visibility'
            | 'invalid_share_version'
            | 'private_share'
            | 'unlisted_share_required',
    ) {
        super(`The dictionary lifecycle state is invalid (${reason}).`);
        this.name = 'InvalidDictionaryLifecycleError';
    }
}

export function validateDictionaryAccessState(
    state: DictionaryAccessState,
): DictionaryAccessState {
    if ((state.lifecycle === 'archived') !== (state.archivedAt !== null)) {
        throw new InvalidDictionaryLifecycleError('archive_timestamp');
    }
    if (state.lifecycle === 'archived' && state.visibility !== 'private') {
        throw new InvalidDictionaryLifecycleError('archived_visibility');
    }
    if (state.visibility === 'private' && state.share !== null) {
        throw new InvalidDictionaryLifecycleError('private_share');
    }
    if (state.visibility === 'unlisted' && state.share === null) {
        throw new InvalidDictionaryLifecycleError('unlisted_share_required');
    }
    if (
        state.share &&
        (!Number.isSafeInteger(state.share.keyVersion) ||
            state.share.keyVersion < 1)
    ) {
        throw new InvalidDictionaryLifecycleError('invalid_share_version');
    }

    return state;
}

export function makeDictionaryUnlisted(
    state: DictionaryAccessState,
    share: ShareCapabilityMetadata,
): DictionaryAccessState {
    if (state.lifecycle === 'archived') {
        throw new InvalidDictionaryLifecycleError('archived_visibility');
    }

    return validateDictionaryAccessState({
        ...state,
        share,
        visibility: 'unlisted',
    });
}

export function makeDictionaryPrivate(
    state: DictionaryAccessState,
): DictionaryAccessState {
    return validateDictionaryAccessState({
        ...state,
        share: null,
        visibility: 'private',
    });
}

export function archiveDictionary(
    state: DictionaryAccessState,
    now: Date,
): DictionaryAccessState {
    if (state.lifecycle === 'archived') {
        return validateDictionaryAccessState(state);
    }

    return {
        archivedAt: now,
        lifecycle: 'archived',
        share: null,
        visibility: 'private',
    };
}

export function restoreDictionary(
    state: DictionaryAccessState,
): DictionaryAccessState {
    if (state.lifecycle === 'active') {
        return validateDictionaryAccessState(state);
    }

    return {
        archivedAt: null,
        lifecycle: 'active',
        share: null,
        visibility: 'private',
    };
}

export function validateCardLifecycleState(
    state: CardLifecycleState,
): CardLifecycleState {
    if ((state.lifecycle === 'archived') !== (state.archivedAt !== null)) {
        throw new InvalidDictionaryLifecycleError('archive_timestamp');
    }

    return state;
}

export function archiveCard(
    state: CardLifecycleState,
    now: Date,
): CardLifecycleState {
    return state.lifecycle === 'archived'
        ? validateCardLifecycleState(state)
        : { archivedAt: now, lifecycle: 'archived' };
}

export function restoreCard(state: CardLifecycleState): CardLifecycleState {
    return state.lifecycle === 'active'
        ? validateCardLifecycleState(state)
        : { archivedAt: null, lifecycle: 'active' };
}
