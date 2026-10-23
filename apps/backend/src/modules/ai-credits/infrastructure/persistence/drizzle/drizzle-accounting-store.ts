import type {
    AccountingRecord,
    AccountingRecordRequest,
    AccountingRefundContext,
    AccountingReport,
} from '@languon/contracts';
import type {
    AccountingCredits,
    AccountingStore,
} from '../../../application/accounting-store';
import {
    type Database,
    type Transaction,
} from './accounting-persistence-support';
import { list, record, refundContext } from './accounting-record-operations';
import { refreshNextReport, report } from './accounting-report-operations';
export class DrizzleAccountingStore implements AccountingStore {
    constructor(
        private readonly database: Database,
        private readonly credits: (tx: Transaction) => AccountingCredits,
    ) {}

    async record(
        input: AccountingRecordRequest,
        actorId: string,
        at: Date,
    ): Promise<AccountingRecord> {
        return record(
            { database: this.database, credits: this.credits },
            input,
            actorId,
            at,
        );
    }

    async refundContext(paymentId: string): Promise<AccountingRefundContext> {
        return refundContext(
            { database: this.database, credits: this.credits },
            paymentId,
        );
    }

    async list(input: { before?: Date; limit: number }) {
        return list({ database: this.database, credits: this.credits }, input);
    }

    async report(from: Date, to: Date): Promise<AccountingReport> {
        return report(
            { database: this.database, credits: this.credits },
            from,
            to,
        );
    }

    /** Worker tick: bounded one report at a time; lease recovers safely after a process crash. */
    async refreshNextReport(at = new Date()): Promise<boolean> {
        return refreshNextReport(
            { database: this.database, credits: this.credits },
            at,
        );
    }
}
export {
    anonymizeAccountingOwner,
    markAccountingReportsDirty,
    recordProviderExpense,
} from './accounting-persistence-support';
