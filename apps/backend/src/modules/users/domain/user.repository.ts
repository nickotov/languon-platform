import type { EmailAddress } from "./email-address";
import type { User } from "./user";

export interface UserWithPrimaryEmail {
  primaryEmail: EmailAddress;
  user: User;
  verifiedAt: Date | null;
}

export interface AddUserWithPrimaryEmailInput {
  emailId: string;
  primaryEmail: EmailAddress;
  user: User;
}

export class UserEmailAlreadyExistsError extends Error {
  public constructor() {
    super("A user identity already exists for that email.");
    this.name = "UserEmailAlreadyExistsError";
  }
}

export interface UserRepository {
  addWithPrimaryEmail(input: AddUserWithPrimaryEmailInput): Promise<void>;
  findByCanonicalEmail(
    canonicalEmail: string,
  ): Promise<UserWithPrimaryEmail | null>;
  findById(id: string): Promise<UserWithPrimaryEmail | null>;
}
