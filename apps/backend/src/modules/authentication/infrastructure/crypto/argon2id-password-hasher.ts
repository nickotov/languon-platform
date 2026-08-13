import {
  hash as argon2Hash,
  verify as argon2Verify,
  type Algorithm,
  type Version,
} from "@node-rs/argon2";

import type {
  PasswordHash,
  PasswordHasher,
  PasswordHasherOperationOptions,
  PasswordVerification,
} from "../../application/ports/password-hasher";

const minimumMemoryCostKiB = 19 * 1024;
const minimumTimeCost = 2;
const minimumParallelism = 1;
const defaultOutputLength = 32;
// @node-rs/argon2 exposes ambient const enums that cannot be referenced under
// isolatedModules. These are the library's documented Argon2id/v=19 values.
const argon2idAlgorithm = 2 as Algorithm;
const argon2Version19 = 1 as Version;

export interface Argon2idPasswordHasherOptions {
  memoryCostKiB?: number;
  outputLength?: number;
  parallelism?: number;
  parametersVersion?: number;
  timeCost?: number;
}

interface Argon2idParameters {
  memoryCostKiB: number;
  outputLength: number;
  parallelism: number;
  timeCost: number;
}

export class Argon2idPasswordHasher implements PasswordHasher {
  private readonly parameters: Argon2idParameters;
  private readonly parametersVersion: number;

  public constructor(options: Argon2idPasswordHasherOptions = {}) {
    this.parameters = {
      memoryCostKiB: options.memoryCostKiB ?? minimumMemoryCostKiB,
      outputLength: options.outputLength ?? defaultOutputLength,
      parallelism: options.parallelism ?? minimumParallelism,
      timeCost: options.timeCost ?? minimumTimeCost,
    };
    this.parametersVersion = options.parametersVersion ?? 1;
    validateOptions(this.parameters, this.parametersVersion);
  }

  public async hash(
    password: string,
    options?: PasswordHasherOperationOptions,
  ): Promise<PasswordHash> {
    const encoded = await argon2Hash(
      password,
      {
        algorithm: argon2idAlgorithm,
        memoryCost: this.parameters.memoryCostKiB,
        outputLen: this.parameters.outputLength,
        parallelism: this.parameters.parallelism,
        timeCost: this.parameters.timeCost,
        version: argon2Version19,
      },
      options?.signal,
    );

    return { encoded, parametersVersion: this.parametersVersion };
  }

  public async verify(
    password: string,
    passwordHash: PasswordHash,
    options?: PasswordHasherOperationOptions,
  ): Promise<PasswordVerification> {
    try {
      const matches = await argon2Verify(
        passwordHash.encoded,
        password,
        undefined,
        options?.signal,
      );

      return {
        matches,
        needsRehash:
          matches &&
          (passwordHash.parametersVersion !== this.parametersVersion ||
            !hasCurrentParameters(passwordHash.encoded, this.parameters)),
      };
    } catch (error) {
      if (isAbortError(error) || options?.signal?.aborted) {
        throw error;
      }

      return { matches: false, needsRehash: false };
    }
  }
}

function hasCurrentParameters(
  encodedHash: string,
  current: Argon2idParameters,
): boolean {
  const sections = encodedHash.split("$");

  if (
    sections.length !== 6 ||
    sections[1] !== "argon2id" ||
    sections[2] !== "v=19"
  ) {
    return false;
  }

  const parameters = new Map(
    (sections[3] ?? "").split(",").map((pair) => {
      const [name, value] = pair.split("=");
      return [name, Number(value)] as const;
    }),
  );
  const encodedOutput = sections[5];

  if (!encodedOutput) {
    return false;
  }

  return (
    parameters.get("m") === current.memoryCostKiB &&
    parameters.get("t") === current.timeCost &&
    parameters.get("p") === current.parallelism &&
    Buffer.from(encodedOutput, "base64").byteLength === current.outputLength
  );
}

function validateOptions(
  parameters: Argon2idParameters,
  parametersVersion: number,
): void {
  if (
    !Number.isSafeInteger(parameters.memoryCostKiB) ||
    parameters.memoryCostKiB < minimumMemoryCostKiB
  ) {
    throw new RangeError(
      `Argon2id memory cost must be at least ${minimumMemoryCostKiB} KiB.`,
    );
  }

  if (
    !Number.isSafeInteger(parameters.timeCost) ||
    parameters.timeCost < minimumTimeCost
  ) {
    throw new RangeError(
      `Argon2id time cost must be at least ${minimumTimeCost}.`,
    );
  }

  if (
    !Number.isSafeInteger(parameters.parallelism) ||
    parameters.parallelism < minimumParallelism
  ) {
    throw new RangeError(
      `Argon2id parallelism must be at least ${minimumParallelism}.`,
    );
  }

  if (
    !Number.isSafeInteger(parameters.outputLength) ||
    parameters.outputLength < defaultOutputLength
  ) {
    throw new RangeError(
      `Argon2id output length must be at least ${defaultOutputLength} bytes.`,
    );
  }

  if (!Number.isSafeInteger(parametersVersion) || parametersVersion < 1) {
    throw new RangeError("Argon2id parameters version must be positive.");
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
