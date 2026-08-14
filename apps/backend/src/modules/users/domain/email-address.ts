const maximumEmailLength = 320;
const asciiPattern = /^[\x20-\x7e]+$/;
const emailPattern =
    /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

export class InvalidEmailAddressError extends Error {
    public constructor() {
        super('The email address is invalid.');
        this.name = 'InvalidEmailAddressError';
    }
}

export class EmailAddress {
    public readonly canonicalValue: string;
    public readonly value: string;

    private constructor(value: string) {
        this.value = value;
        this.canonicalValue = value.toLowerCase();
        Object.freeze(this);
    }

    public static create(input: string): EmailAddress {
        const value = input.trim();

        if (
            value.length === 0 ||
            value.length > maximumEmailLength ||
            !asciiPattern.test(value) ||
            !emailPattern.test(value)
        ) {
            throw new InvalidEmailAddressError();
        }

        return new EmailAddress(value);
    }

    public equals(other: EmailAddress): boolean {
        return this.canonicalValue === other.canonicalValue;
    }
}
