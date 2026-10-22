import { z } from 'zod';

/** USD is entered manually; six decimals retain sub-cent provider costs exactly. */
export const AccountingUsdSchema = z
    .string()
    .regex(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/);
export const AccountingCreditAmountSchema = z
    .string()
    .regex(/^(0|[1-9]\d{0,12})(\.\d{1,3})?$/);
const positiveUsd = AccountingUsdSchema.refine(
    (value) => /[1-9]/.test(value),
    'Amount must be positive.',
);
const text = z.string().trim().min(1).max(200);
const base = {
    idempotencyKey: z.string().uuid(),
    occurredAt: z.string().datetime({ offset: true }),
    reference: text,
    reason: z.string().trim().min(5).max(500),
    source: z.literal('manual'),
};
export const AccountingPaymentRequestSchema = z
    .object({
        ...base,
        kind: z.literal('payment'),
        ownerId: z.string().uuid(),
        amountUsd: positiveUsd,
        feeUsd: AccountingUsdSchema,
        credits: AccountingCreditAmountSchema.refine((value) => {
            try {
                const [whole = '0', fraction = ''] = value.split('.');
                const milli =
                    BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
                return milli > 0n && milli <= 1000000000000000n;
            } catch {
                return false;
            }
        }, 'Purchase credits must be positive and at most 1000000000000, so all available credits remain revocable.'),
        originalCurrency: z
            .string()
            .regex(/^[A-Z]{3}$/)
            .nullable()
            .default(null),
        originalAmount: z
            .string()
            .regex(/^\d{1,15}(\.\d{1,6})?$/)
            .nullable()
            .default(null),
    })
    .strict();
export const AccountingRefundRequestSchema = z
    .object({
        ...base,
        kind: z.literal('refund'),
        paymentId: z.string().uuid(),
        amountUsd: positiveUsd,
        revokeAvailableCredits: AccountingCreditAmountSchema,
    })
    .strict();
export const AccountingProviderDepositRequestSchema = z
    .object({
        ...base,
        kind: z.literal('provider_deposit'),
        providerId: text,
        amountUsd: positiveUsd,
    })
    .strict();
export const AccountingProviderBalanceRequestSchema = z
    .object({
        ...base,
        kind: z.literal('provider_balance'),
        providerId: text,
        amountUsd: AccountingUsdSchema,
    })
    .strict();
export const AccountingProviderBillRequestSchema = z
    .object({
        ...base,
        kind: z.literal('provider_bill'),
        providerId: text,
        amountUsd: AccountingUsdSchema,
        periodStart: z.string().datetime({ offset: true }),
        periodEnd: z.string().datetime({ offset: true }),
    })
    .strict();
export const AccountingRecordRequestSchema = z
    .discriminatedUnion('kind', [
        AccountingPaymentRequestSchema,
        AccountingRefundRequestSchema,
        AccountingProviderDepositRequestSchema,
        AccountingProviderBalanceRequestSchema,
        AccountingProviderBillRequestSchema,
    ])
    .superRefine((value, ctx) => {
        if (
            value.kind === 'provider_bill' &&
            new Date(value.periodEnd) <= new Date(value.periodStart)
        )
            ctx.addIssue({
                code: 'custom',
                path: ['periodEnd'],
                message: 'Period end must follow start.',
            });
        if (
            value.kind === 'payment' &&
            (value.originalCurrency === null) !==
                (value.originalAmount === null)
        )
            ctx.addIssue({
                code: 'custom',
                path: ['originalAmount'],
                message:
                    'Original amount and currency must be supplied together.',
            });
    });
export type AccountingRecordRequest = z.infer<
    typeof AccountingRecordRequestSchema
>;
export const AccountingRecordSchema = z.object({
    id: z.string().uuid(),
    createdAt: z.string().datetime(),
    createdBy: z.string().uuid().nullable(),
    grantId: z.string().uuid().nullable(),
    data: AccountingRecordRequestSchema,
});
export type AccountingRecord = z.infer<typeof AccountingRecordSchema>;
export const AccountingReportQuerySchema = z
    .object({
        from: z.string().datetime({ offset: true }),
        to: z.string().datetime({ offset: true }),
    })
    .refine(
        (value) =>
            new Date(value.to) > new Date(value.from) &&
            new Date(value.to).getTime() - new Date(value.from).getTime() <=
                366 * 86400000,
        { message: 'Report period must be positive and at most 366 days.' },
    );
export const AccountingReportSchema = z.object({
    generatedAt: z.string().datetime(),
    from: z.string().datetime(),
    to: z.string().datetime(),
    cash: z.object({
        paymentsUsd: AccountingUsdSchema,
        refundsUsd: AccountingUsdSchema,
        feesUsd: AccountingUsdSchema,
        netReceiptsUsd: z.string(),
    }),
    usage: z.object({
        calculatedExpenseUsd: AccountingUsdSchema,
        measuredCount: z.number().int().nonnegative(),
        estimatedCount: z.number().int().nonnegative(),
        unknownCount: z.number().int().nonnegative(),
        allocatedPurchaseValueUsd: AccountingUsdSchema,
        unusedPurchaseValueUsd: AccountingUsdSchema,
        refundedConsumedValueUsd: AccountingUsdSchema,
        manualUnallocatedAdjustmentUsd: z.string(),
        operationalMarginUsd: z.string(),
        complete: z.boolean(),
    }),
    providers: z.array(
        z.object({
            providerId: z.string(),
            depositsUsd: AccountingUsdSchema,
            calculatedExpenseUsd: AccountingUsdSchema,
            latestBalanceUsd: AccountingUsdSchema.nullable(),
            balanceObservedAt: z.string().datetime().nullable(),
            estimatedRemainingUsd: z.string(),
            bills: z.array(
                z.object({
                    id: z.string().uuid(),
                    periodStart: z.string().datetime(),
                    periodEnd: z.string().datetime(),
                    invoiceUsd: AccountingUsdSchema,
                    calculatedExpenseUsd: AccountingUsdSchema,
                    unallocatedAdjustmentUsd: z.string(),
                    unknownCount: z.number().int().nonnegative(),
                }),
            ),
        }),
    ),
});
export type AccountingReport = z.infer<typeof AccountingReportSchema>;
export const AccountingRefundContextSchema = z.object({
    paymentId: z.string().uuid(),
    ownerId: z.string().uuid().nullable(),
    grantId: z.string().uuid().nullable(),
    paidUsd: AccountingUsdSchema,
    refundedUsd: AccountingUsdSchema,
    availableCredits: AccountingCreditAmountSchema.nullable(),
    reservedCredits: AccountingCreditAmountSchema.nullable(),
    consumedCredits: AccountingCreditAmountSchema.nullable(),
    revokedCredits: AccountingCreditAmountSchema.nullable(),
});
export type AccountingRefundContext = z.infer<
    typeof AccountingRefundContextSchema
>;
