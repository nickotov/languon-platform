export type UserStatus = 'active' | 'disabled' | 'pending';

export interface UserProperties {
    createdAt: Date;
    id: string;
    status: UserStatus;
    updatedAt: Date;
    version: number;
}

export interface CreatePendingUserProperties {
    id: string;
    now: Date;
}

export class InvalidUserTransitionError extends Error {
    public constructor(from: UserStatus, to: UserStatus) {
        super(`A user cannot transition from ${from} to ${to}.`);
        this.name = 'InvalidUserTransitionError';
    }
}

export class User implements UserProperties {
    public readonly createdAt: Date;
    public readonly id: string;
    public readonly status: UserStatus;
    public readonly updatedAt: Date;
    public readonly version: number;

    private constructor(properties: UserProperties) {
        this.createdAt = properties.createdAt;
        this.id = properties.id;
        this.status = properties.status;
        this.updatedAt = properties.updatedAt;
        this.version = properties.version;
        Object.freeze(this);
    }

    public static createPending(properties: CreatePendingUserProperties): User {
        return new User({
            createdAt: properties.now,
            id: properties.id,
            status: 'pending',
            updatedAt: properties.now,
            version: 1,
        });
    }

    public static restore(properties: UserProperties): User {
        return new User(properties);
    }

    public activate(now: Date): User {
        if (this.status === 'active') {
            return this;
        }

        if (this.status !== 'pending') {
            throw new InvalidUserTransitionError(this.status, 'active');
        }

        return new User({
            createdAt: this.createdAt,
            id: this.id,
            status: 'active',
            updatedAt: now,
            version: this.version + 1,
        });
    }

    public disable(now: Date): User {
        if (this.status === 'disabled') {
            throw new InvalidUserTransitionError(this.status, 'disabled');
        }

        return new User({
            createdAt: this.createdAt,
            id: this.id,
            status: 'disabled',
            updatedAt: now,
            version: this.version + 1,
        });
    }

    public restoreAvailability(emailVerified: boolean, now: Date): User {
        if (this.status !== 'disabled') {
            throw new InvalidUserTransitionError(
                this.status,
                emailVerified ? 'active' : 'pending',
            );
        }

        return new User({
            createdAt: this.createdAt,
            id: this.id,
            status: emailVerified ? 'active' : 'pending',
            updatedAt: now,
            version: this.version + 1,
        });
    }
}
