import type {
    AdminAiCreditsQuery,
    AdminAiCreditsResponse,
    AdminAiSettingsResponse,
    AdminAuditEventsQuery,
    AdminDashboardResponse,
    AdminUserDetail,
    AdminUsersQuery,
    AdminUsersResponse,
} from '@languon/contracts';
import type { AccountDeletionRecoveryJournal } from '../../../../users/application/ports/account-deletion-recovery-journal';
import type {
    AdminAiCreditAdjustmentMutationInput,
    AdminAiCreditPolicyMutationInput,
    AdminAiSettingsMutationInput,
    AdminAuditWrite,
    AdministrationStore,
    AdminUserMutationInput,
} from '../../../application/ports/administration-store';
import { aiSettings, updateAiSettings } from './administration-ai-settings';
import {
    adjustAiCredits,
    aiCredits,
    updateAiCreditPolicy,
} from './administration-credit-operations';
import { type AdministrationDatabase } from './administration-persistence-support';
import {
    dashboard,
    findActiveMembership,
    findUser,
    listAuditEvents,
    listUsers,
    recordAudit,
} from './administration-read-operations';
import {
    cancelUserDeletion,
    disableUser,
    restoreUser,
} from './administration-user-mutations';
export class DrizzleAdministrationStore implements AdministrationStore {
    public constructor(
        private readonly database: AdministrationDatabase,
        private readonly cancellationJournal: Pick<
            AccountDeletionRecoveryJournal,
            'recordCancellation'
        >,
    ) {}

    public async findActiveMembership(userId: string) {
        return findActiveMembership(
            {
                database: this.database,
                cancellationJournal: this.cancellationJournal,
            },
            userId,
        );
    }

    public async aiSettings(): Promise<AdminAiSettingsResponse> {
        return aiSettings({
            database: this.database,
            cancellationJournal: this.cancellationJournal,
        });
    }

    public async aiCredits(
        userId: string,
        query: AdminAiCreditsQuery,
        at: Date,
    ): Promise<AdminAiCreditsResponse> {
        return aiCredits(
            {
                database: this.database,
                cancellationJournal: this.cancellationJournal,
            },
            userId,
            query,
            at,
        );
    }

    public updateAiCreditPolicy(input: AdminAiCreditPolicyMutationInput) {
        return updateAiCreditPolicy(
            {
                database: this.database,
                cancellationJournal: this.cancellationJournal,
            },
            input,
        );
    }

    public adjustAiCredits(input: AdminAiCreditAdjustmentMutationInput) {
        return adjustAiCredits(
            {
                database: this.database,
                cancellationJournal: this.cancellationJournal,
            },
            input,
        );
    }

    public async updateAiSettings(
        input: AdminAiSettingsMutationInput,
    ): Promise<AdminAiSettingsResponse> {
        return updateAiSettings(
            {
                database: this.database,
                cancellationJournal: this.cancellationJournal,
            },
            input,
        );
    }

    public async dashboard(): Promise<AdminDashboardResponse> {
        return dashboard({
            database: this.database,
            cancellationJournal: this.cancellationJournal,
        });
    }

    public async listUsers(
        input: AdminUsersQuery,
    ): Promise<AdminUsersResponse> {
        return listUsers(
            {
                database: this.database,
                cancellationJournal: this.cancellationJournal,
            },
            input,
        );
    }

    public findUser(userId: string): Promise<AdminUserDetail | null> {
        return findUser(
            {
                database: this.database,
                cancellationJournal: this.cancellationJournal,
            },
            userId,
        );
    }

    public async listAuditEvents(input: AdminAuditEventsQuery) {
        return listAuditEvents(
            {
                database: this.database,
                cancellationJournal: this.cancellationJournal,
            },
            input,
        );
    }

    public async recordAudit(input: AdminAuditWrite): Promise<void> {
        return recordAudit(
            {
                database: this.database,
                cancellationJournal: this.cancellationJournal,
            },
            input,
        );
    }

    public disableUser(input: AdminUserMutationInput) {
        return disableUser(
            {
                database: this.database,
                cancellationJournal: this.cancellationJournal,
            },
            input,
        );
    }

    public restoreUser(input: AdminUserMutationInput) {
        return restoreUser(
            {
                database: this.database,
                cancellationJournal: this.cancellationJournal,
            },
            input,
        );
    }

    public cancelUserDeletion(
        input: AdminUserMutationInput,
    ): Promise<AdminUserDetail> {
        return cancelUserDeletion(
            {
                database: this.database,
                cancellationJournal: this.cancellationJournal,
            },
            input,
        );
    }
}
