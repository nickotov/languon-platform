import type { UserRepository } from '../domain/user.repository';
import type { UsersUnitOfWork } from './users-unit-of-work';

export class UserProfileUnavailableError extends Error {
    public constructor() {
        super('The account is unavailable.');
        this.name = 'UserProfileUnavailableError';
    }
}

export class UserProfileConflictError extends Error {
    public constructor() {
        super('The account changed concurrently.');
        this.name = 'UserProfileConflictError';
    }
}

export class UserProfileService {
    public constructor(private readonly users: UsersUnitOfWork) {}

    public updateHandle(input: {
        handle: string;
        now: Date;
        userId: string;
    }): Promise<string> {
        return this.users.execute(async (repository: UserRepository) => {
            const found = await repository.findById(input.userId);
            if (!found || found.user.status !== 'active') {
                throw new UserProfileUnavailableError();
            }
            if (found.user.handle === input.handle) return input.handle;
            const changed = found.user.withHandle(input.handle, input.now);
            if (!(await repository.saveHandle(changed, found.user.version))) {
                throw new UserProfileConflictError();
            }
            return input.handle;
        });
    }
}
