export type VerificationChallengePurpose =
  "email_verification" | "password_reset";

export interface VerificationChallengeProperties {
  attemptsUsed: number;
  codeDigest: string;
  consumedAt: Date | null;
  expiresAt: Date;
  id: string;
  invalidatedAt: Date | null;
  issuedAt: Date;
  purpose: VerificationChallengePurpose;
  userId: string;
}

export interface IssueVerificationChallengeProperties {
  codeDigest: string;
  expiresAt: Date;
  id: string;
  issuedAt: Date;
  purpose: VerificationChallengePurpose;
  userId: string;
}

export type VerificationOutcome = "incorrect" | "unavailable" | "verified";

export interface VerificationResult {
  challenge: VerificationChallenge;
  outcome: VerificationOutcome;
}

const maximumAttempts = 5;

export class VerificationChallenge implements VerificationChallengeProperties {
  public readonly attemptsUsed: number;
  public readonly codeDigest: string;
  public readonly consumedAt: Date | null;
  public readonly expiresAt: Date;
  public readonly id: string;
  public readonly invalidatedAt: Date | null;
  public readonly issuedAt: Date;
  public readonly purpose: VerificationChallengePurpose;
  public readonly userId: string;

  private constructor(properties: VerificationChallengeProperties) {
    this.attemptsUsed = properties.attemptsUsed;
    this.codeDigest = properties.codeDigest;
    this.consumedAt = properties.consumedAt;
    this.expiresAt = properties.expiresAt;
    this.id = properties.id;
    this.invalidatedAt = properties.invalidatedAt;
    this.issuedAt = properties.issuedAt;
    this.purpose = properties.purpose;
    this.userId = properties.userId;
    Object.freeze(this);
  }

  public static issue(
    properties: IssueVerificationChallengeProperties,
  ): VerificationChallenge {
    if (properties.expiresAt <= properties.issuedAt) {
      throw new RangeError("A verification challenge must expire after issue.");
    }

    return new VerificationChallenge({
      ...properties,
      attemptsUsed: 0,
      consumedAt: null,
      invalidatedAt: null,
    });
  }

  public static restore(
    properties: VerificationChallengeProperties,
  ): VerificationChallenge {
    return new VerificationChallenge(properties);
  }

  public invalidate(now: Date): VerificationChallenge {
    if (this.consumedAt || this.invalidatedAt) {
      return this;
    }

    return this.copy({ invalidatedAt: now });
  }

  public verify(input: { matches: boolean; now: Date }): VerificationResult {
    if (
      this.consumedAt ||
      this.invalidatedAt ||
      this.attemptsUsed >= maximumAttempts ||
      input.now >= this.expiresAt
    ) {
      return { challenge: this, outcome: "unavailable" };
    }

    if (input.matches) {
      return {
        challenge: this.copy({ consumedAt: input.now }),
        outcome: "verified",
      };
    }

    return {
      challenge: this.copy({ attemptsUsed: this.attemptsUsed + 1 }),
      outcome: "incorrect",
    };
  }

  private copy(
    changes: Partial<VerificationChallengeProperties>,
  ): VerificationChallenge {
    return new VerificationChallenge({
      attemptsUsed: this.attemptsUsed,
      codeDigest: this.codeDigest,
      consumedAt: this.consumedAt,
      expiresAt: this.expiresAt,
      id: this.id,
      invalidatedAt: this.invalidatedAt,
      issuedAt: this.issuedAt,
      purpose: this.purpose,
      userId: this.userId,
      ...changes,
    });
  }
}
