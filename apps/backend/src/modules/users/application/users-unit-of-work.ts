import type { UserRepository } from '../domain/user.repository';

export interface UsersUnitOfWork {
    execute<T>(work: (users: UserRepository) => Promise<T>): Promise<T>;
}
