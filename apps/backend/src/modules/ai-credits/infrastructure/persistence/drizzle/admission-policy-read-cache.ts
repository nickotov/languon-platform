import type {
    CapabilityPolicy,
    AiAccountingSettingsSchema,
} from '@languon/contracts';
import type { z } from 'zod';
import type { AiCreditTransaction } from './drizzle-ai-credit-participant';

type Settings = z.infer<typeof AiAccountingSettingsSchema>;
interface AdmissionReads {
    policies: Map<CapabilityPolicy['capability'], Promise<CapabilityPolicy>>;
    settings?: Promise<Settings>;
}
/** Opt-in only for an admission transaction, never a database/client handle.
 * One action pins one view of immutable policies. No value survives its transaction. */
const reads = new WeakMap<AiCreditTransaction, AdmissionReads>();
export function enableAdmissionPolicyReadCache(tx: AiCreditTransaction) {
    if (!reads.has(tx)) reads.set(tx, { policies: new Map() });
}

export function admissionPolicyReads(tx: AiCreditTransaction) {
    return reads.get(tx);
}

/** Preparatory reads must never pin financial policy before the admission fence. */
export function discardAdmissionPolicyReads(tx: AiCreditTransaction) {
    reads.delete(tx);
}
