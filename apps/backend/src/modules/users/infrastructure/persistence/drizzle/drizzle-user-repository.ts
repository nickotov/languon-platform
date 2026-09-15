import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { EmailAddress } from '../../../domain/email-address';
import type { UserWithPrimaryEmail } from '../../../domain/user.repository';
import { User, type UserStatus } from '../../../domain/user';
import { userEmailsTable, usersTable } from './schema';

type UsersDatabase = Pick<
    PostgresJsDatabase<typeof databaseSchema>,
    'insert' | 'select'
>;

export class DrizzleUserRepository {
    private constructor(private readonly database: UsersDatabase) {}

    public static readOnly(database: UsersDatabase): DrizzleUserRepository {
        return new DrizzleUserRepository(database);
    }

    public async findByCanonicalEmail(
        canonicalEmail: string,
    ): Promise<UserWithPrimaryEmail | null> {
        const rows = await this.selectUserWithPrimaryEmail().where(
            eq(userEmailsTable.canonicalEmail, canonicalEmail),
        );

        return rows[0] ? mapUserWithPrimaryEmail(rows[0]) : null;
    }

    public async findById(id: string): Promise<UserWithPrimaryEmail | null> {
        const rows = await this.selectUserWithPrimaryEmail().where(
            eq(usersTable.id, id),
        );

        return rows[0] ? mapUserWithPrimaryEmail(rows[0]) : null;
    }

    private selectUserWithPrimaryEmail() {
        return this.database
            .select({
                canonicalEmail: userEmailsTable.canonicalEmail,
                createdAt: usersTable.createdAt,
                email: userEmailsTable.email,
                id: usersTable.id,
                handle: usersTable.handle,
                status: usersTable.status,
                updatedAt: usersTable.updatedAt,
                verifiedAt: userEmailsTable.verifiedAt,
                version: usersTable.version,
            })
            .from(usersTable)
            .innerJoin(
                userEmailsTable,
                and(
                    eq(userEmailsTable.userId, usersTable.id),
                    eq(userEmailsTable.isPrimary, true),
                ),
            )
            .limit(1);
    }
}

interface UserWithPrimaryEmailRow {
    canonicalEmail: string;
    createdAt: Date;
    email: string;
    id: string;
    handle: string | null;
    status: UserStatus;
    updatedAt: Date;
    verifiedAt: Date | null;
    version: number;
}

function mapUserWithPrimaryEmail(
    row: UserWithPrimaryEmailRow,
): UserWithPrimaryEmail {
    const primaryEmail = EmailAddress.create(row.email);

    if (primaryEmail.canonicalValue !== row.canonicalEmail) {
        throw new Error('Persisted email canonicalization is inconsistent.');
    }

    return {
        primaryEmail,
        user: User.restore({
            createdAt: row.createdAt,
            id: row.id,
            handle: row.handle,
            status: row.status,
            updatedAt: row.updatedAt,
            version: row.version,
        }),
        verifiedAt: row.verifiedAt,
    };
}
