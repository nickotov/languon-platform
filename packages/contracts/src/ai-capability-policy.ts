import { z } from 'zod';

export const AiCapabilitySchema = z.enum([
    'portrait-interview',
    'conversation',
    'dictionary-generation',
    'sentence-generation',
    'text-translation',
    'speech',
]);
export const CapabilityPolicySchema = z.object({
    capability: AiCapabilitySchema,
    version: z.number().int().nonnegative(),
    revisionId: z.uuid().nullable(),
    funding: z.enum(['customer', 'operator']),
    updatedAt: z.iso.datetime().nullable(),
});
export type CapabilityPolicy = z.infer<typeof CapabilityPolicySchema>;
export const CapabilityPolicyPublishSchema = z.object({
    capability: AiCapabilitySchema,
    expectedVersion: z.number().int().nonnegative(),
    funding: z.enum(['customer', 'operator']),
    reason: z.string().trim().min(5).max(500),
});

import { AiActionCreditBudgetSchema } from './text-ai';
export const OperatorUsdBudgetSchema = z
    .string()
    .regex(/^(0|[1-9][0-9]{0,8})(\.[0-9]{1,6})?$/u)
    .refine(
        (value) => /[1-9]/u.test(value),
        'Operator budget must be positive.',
    );
function operatorBudgetHierarchy(
    value: {
        maxProviderCostUsdPerAction: string | null;
        maxProviderCostUsdPerAccountDay: string | null;
        maxProviderCostUsdPerDay: string | null;
    },
    context: z.RefinementCtx,
) {
    const values = [
        value.maxProviderCostUsdPerAction,
        value.maxProviderCostUsdPerAccountDay,
        value.maxProviderCostUsdPerDay,
    ];
    if (values.every((entry) => entry === null)) return;
    if (values.some((entry) => entry === null)) {
        context.addIssue({
            code: 'custom',
            message:
                'Set all three operator budgets together, or leave all unset.',
        });
        return;
    }
    if (
        values.some(
            (entry) => !OperatorUsdBudgetSchema.safeParse(entry).success,
        )
    )
        return;
    const micros = values.map((entry) => {
        const [whole = '0', fraction = ''] = entry!.split('.');
        return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
    });
    if (micros[0]! > micros[1]! || micros[1]! > micros[2]!)
        context.addIssue({
            code: 'custom',
            message:
                'Operator budgets must satisfy action <= account per day <= global per day.',
        });
}
export const AiAccountingSettingsSchema = z
    .object({
        version: z.number().int().nonnegative(),
        defaultMaxCreditsPerAction: AiActionCreditBudgetSchema.nullable(),
        maxProviderCostUsdPerAction:
            OperatorUsdBudgetSchema.nullable().default(null),
        maxProviderCostUsdPerAccountDay:
            OperatorUsdBudgetSchema.nullable().default(null),
        maxProviderCostUsdPerDay:
            OperatorUsdBudgetSchema.nullable().default(null),
    })
    .superRefine(operatorBudgetHierarchy);
export const AiAccountingSettingsPublishSchema = z
    .object({
        expectedVersion: z.number().int().nonnegative(),
        defaultMaxCreditsPerAction: AiActionCreditBudgetSchema.nullable(),
        maxProviderCostUsdPerAction:
            OperatorUsdBudgetSchema.nullable().default(null),
        maxProviderCostUsdPerAccountDay:
            OperatorUsdBudgetSchema.nullable().default(null),
        maxProviderCostUsdPerDay:
            OperatorUsdBudgetSchema.nullable().default(null),
        reason: z.string().trim().min(5).max(500),
    })
    .superRefine(operatorBudgetHierarchy);
