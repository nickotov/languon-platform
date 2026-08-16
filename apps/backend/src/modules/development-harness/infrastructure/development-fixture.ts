import type { PostgresJsDatabase } from '@languon/database';

import type { databaseSchema } from '../../../infrastructure/database/schema';
import { EmailAddress } from '../../users/domain/email-address';
import { User } from '../../users/domain/user';
import { DrizzleUsersUnitOfWork } from '../../users/infrastructure/persistence/drizzle/drizzle-users-unit-of-work';

export const developmentHarnessFixture = {
    email: 'mastra-playground@example.test',
    emailId: '00000000-0000-4000-8000-000000000020',
    principalId: '00000000-0000-4000-8000-000000000019',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
} as const;

export async function seedDevelopmentHarnessFixture(
    database: PostgresJsDatabase<typeof databaseSchema>,
): Promise<void> {
    const unitOfWork = new DrizzleUsersUnitOfWork(database);

    await unitOfWork.execute(async (users) => {
        const existing = await users.findById(
            developmentHarnessFixture.principalId,
        );

        if (existing) {
            if (
                existing.primaryEmail.canonicalValue !==
                    developmentHarnessFixture.email ||
                existing.user.status !== 'active' ||
                existing.verifiedAt === null
            ) {
                throw new Error(
                    'The deterministic Mastra playground principal conflicts with existing data.',
                );
            }
            return;
        }

        const user = User.createPending({
            id: developmentHarnessFixture.principalId,
            now: developmentHarnessFixture.timestamp,
        }).activate(developmentHarnessFixture.timestamp);

        await users.addWithPrimaryEmail({
            emailId: developmentHarnessFixture.emailId,
            primaryEmail: EmailAddress.create(developmentHarnessFixture.email),
            user,
            verifiedAt: developmentHarnessFixture.timestamp,
        });
    });
}
