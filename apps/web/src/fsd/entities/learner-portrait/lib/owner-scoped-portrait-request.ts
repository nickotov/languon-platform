import {
    PortraitApiError,
    type PortraitSessionRequest,
} from '../api/portrait-api';

/** Pin an account across deferred session acquisition, refresh retries, and receipt. */
export function ownerScopedPortraitRequest(
    ownerId: string | null,
    requestWithSession: PortraitSessionRequest,
    getCurrentOwner: () => string | null,
): PortraitSessionRequest {
    function assertOwner() {
        if (ownerId !== null && getCurrentOwner() === ownerId) return;
        throw new PortraitApiError(401, {
            code: 'authentication_required',
            message: 'Your account changed. Reopen your portrait to continue.',
            correlationId: 'portrait-owner-changed',
        });
    }

    return async <T>(operation: (token: string) => Promise<T>) => {
        assertOwner();
        const result = await requestWithSession(async (token) => {
            assertOwner();
            const value = await operation(token);
            assertOwner();
            return value;
        });
        assertOwner();
        return result;
    };
}
