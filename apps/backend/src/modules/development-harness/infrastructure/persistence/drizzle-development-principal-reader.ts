import type { PostgresJsDatabase } from '@languon/database';

import type { databaseSchema } from '../../../../infrastructure/database/schema';
import type {
    DevelopmentPrincipal,
    DevelopmentPrincipalReader,
} from '../../application/ports/development-principal-reader';
import { DrizzleUserRepository } from '../../../users/infrastructure/persistence/drizzle/drizzle-user-repository';

export class DrizzleDevelopmentPrincipalReader implements DevelopmentPrincipalReader {
    private readonly users: DrizzleUserRepository;

    public constructor(database: PostgresJsDatabase<typeof databaseSchema>) {
        this.users = DrizzleUserRepository.readOnly(database);
    }

    public async findById(id: string): Promise<DevelopmentPrincipal | null> {
        const result = await this.users.findById(id);

        if (!result) return null;

        return {
            email: result.primaryEmail.value,
            id: result.user.id,
            status: result.user.status,
            verifiedAt: result.verifiedAt,
        };
    }
}
