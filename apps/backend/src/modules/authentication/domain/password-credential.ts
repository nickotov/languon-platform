export interface PasswordCredentialProperties {
    algorithm: 'argon2id';
    createdAt: Date;
    hash: string;
    parametersVersion: number;
    updatedAt: Date;
    userId: string;
}

export class PasswordCredential implements PasswordCredentialProperties {
    public readonly algorithm: 'argon2id';
    public readonly createdAt: Date;
    public readonly hash: string;
    public readonly parametersVersion: number;
    public readonly updatedAt: Date;
    public readonly userId: string;

    private constructor(properties: PasswordCredentialProperties) {
        this.algorithm = properties.algorithm;
        this.createdAt = properties.createdAt;
        this.hash = properties.hash;
        this.parametersVersion = properties.parametersVersion;
        this.updatedAt = properties.updatedAt;
        this.userId = properties.userId;
        Object.freeze(this);
    }

    public static create(
        properties: Omit<PasswordCredentialProperties, 'updatedAt'>,
    ): PasswordCredential {
        if (properties.parametersVersion < 1) {
            throw new RangeError('Password parameter versions start at one.');
        }
        return new PasswordCredential({
            ...properties,
            updatedAt: properties.createdAt,
        });
    }

    public static restore(
        properties: PasswordCredentialProperties,
    ): PasswordCredential {
        return new PasswordCredential(properties);
    }

    public replace(input: {
        algorithm: 'argon2id';
        hash: string;
        now: Date;
        parametersVersion: number;
    }): PasswordCredential {
        return new PasswordCredential({
            ...this.toProperties(),
            ...input,
            updatedAt: input.now,
        });
    }

    public toProperties(): PasswordCredentialProperties {
        return {
            algorithm: this.algorithm,
            createdAt: this.createdAt,
            hash: this.hash,
            parametersVersion: this.parametersVersion,
            updatedAt: this.updatedAt,
            userId: this.userId,
        };
    }
}
