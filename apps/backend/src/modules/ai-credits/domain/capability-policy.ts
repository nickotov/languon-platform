import type { CapabilityPolicy } from '@languon/contracts';
export type { CapabilityPolicy } from '@languon/contracts';
/** Version zero is a deterministic initial policy, never a lazy database write. */
export function initialCapabilityPolicy(
    capability: CapabilityPolicy['capability'],
): CapabilityPolicy {
    return {
        capability,
        version: 0,
        revisionId: null,
        funding: capability === 'portrait-interview' ? 'operator' : 'customer',
        updatedAt: null,
    };
}
