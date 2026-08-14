import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import type { UsersUnitOfWork } from '../../../application/users-unit-of-work';
import {
    type AddUserWithPrimaryEmailInput,
    UserEmailAlreadyExistsError,
    type UserRepository,
} from '../../../domain/user.repository';
import { DrizzleUserRepository } from './drizzle-user-repository';
import { userEmailsTable, usersTable } from './schema';

type UsersTransaction = Parameters<
    Parameters<PostgresJsDatabase<typeof databaseSchema>['transaction']>[0]
>[0];

interface DatabaseError {
    cause?: unknown;
    code?: unknown;
    constraint_name?: unknown;
}

function isCanonicalEmailConflict(error: unknown): boolean {
    const databaseError = error as DatabaseError;
    return Boolean(
        (databaseError.code === '23505' &&
            databaseError.constraint_name ===
                'user_emails_canonical_email_unique') ||
        (databaseError.cause && isCanonicalEmailConflict(databaseError.cause)),
    );
}

// Intentionally local to the unit-of-work module: no root database handle can
// construct a write-capable identity repository.
class TransactionalUserRepository implements UserRepository {
    private readonly reader: DrizzleUserRepository;

    public constructor(private readonly transaction: UsersTransaction) {
        this.reader = DrizzleUserRepository.readOnly(transaction);
    }

    public async addWithPrimaryEmail(
        input: AddUserWithPrimaryEmailInput,
    ): Promise<void> {
        try {
            await this.transaction.insert(usersTable).values({
                createdAt: input.user.createdAt,
                id: input.user.id,
                status: input.user.status,
                updatedAt: input.user.updatedAt,
                version: input.user.version,
            });
            await this.transaction.insert(userEmailsTable).values({
                canonicalEmail: input.primaryEmail.canonicalValue,
                createdAt: input.user.createdAt,
                email: input.primaryEmail.value,
                id: input.emailId,
                isPrimary: true,
                updatedAt: input.user.updatedAt,
                userId: input.user.id,
            });
        } catch (error) {
            if (isCanonicalEmailConflict(error)) {
                throw new UserEmailAlreadyExistsError();
            }
            throw error;
        }
    }

    public findByCanonicalEmail(canonicalEmail: string) {
        return this.reader.findByCanonicalEmail(canonicalEmail);
    }

    public findById(id: string) {
        return this.reader.findById(id);
    }
}

export class DrizzleUsersUnitOfWork implements UsersUnitOfWork {
    public constructor(
        private readonly database: PostgresJsDatabase<typeof databaseSchema>,
    ) {}

    public execute<T>(work: (users: UserRepository) => Promise<T>): Promise<T> {
        return this.database.transaction((transaction) =>
            work(new TransactionalUserRepository(transaction)),
        );
    }
}
