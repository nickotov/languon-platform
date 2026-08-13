export type PasskeyDeviceType = "multi_device" | "single_device";

export interface PasskeyProperties {
  backedUp: boolean;
  canonicalName: string;
  counter: number;
  createdAt: Date;
  credentialId: string;
  credentialPublicKey: Uint8Array;
  deviceType: PasskeyDeviceType;
  id: string;
  lastUsedAt: Date | null;
  name: string;
  revokedAt: Date | null;
  transports: string[];
  updatedAt: Date;
  userHandle: string;
  userId: string;
}

export class InvalidPasskeyNameError extends Error {
  public constructor() {
    super("The passkey name is invalid.");
    this.name = "InvalidPasskeyNameError";
  }
}

function normalizeName(input: string): { canonicalName: string; name: string } {
  const name = input.trim();

  if (name.length === 0 || [...name].length > 80) {
    throw new InvalidPasskeyNameError();
  }

  return { canonicalName: name.toLocaleLowerCase("en-US"), name };
}

export class Passkey implements PasskeyProperties {
  public readonly backedUp: boolean;
  public readonly canonicalName: string;
  public readonly counter: number;
  public readonly createdAt: Date;
  public readonly credentialId: string;
  public readonly credentialPublicKey: Uint8Array;
  public readonly deviceType: PasskeyDeviceType;
  public readonly id: string;
  public readonly lastUsedAt: Date | null;
  public readonly name: string;
  public readonly revokedAt: Date | null;
  public readonly transports: string[];
  public readonly updatedAt: Date;
  public readonly userHandle: string;
  public readonly userId: string;

  private constructor(properties: PasskeyProperties) {
    this.backedUp = properties.backedUp;
    this.canonicalName = properties.canonicalName;
    this.counter = properties.counter;
    this.createdAt = properties.createdAt;
    this.credentialId = properties.credentialId;
    this.credentialPublicKey = new Uint8Array(properties.credentialPublicKey);
    this.deviceType = properties.deviceType;
    this.id = properties.id;
    this.lastUsedAt = properties.lastUsedAt;
    this.name = properties.name;
    this.revokedAt = properties.revokedAt;
    this.transports = [...properties.transports];
    this.updatedAt = properties.updatedAt;
    this.userHandle = properties.userHandle;
    this.userId = properties.userId;
    Object.freeze(this.transports);
    Object.freeze(this);
  }

  public static register(
    properties: Omit<
      PasskeyProperties,
      "canonicalName" | "lastUsedAt" | "revokedAt" | "updatedAt"
    >,
  ): Passkey {
    const normalized = normalizeName(properties.name);
    return new Passkey({
      ...properties,
      ...normalized,
      lastUsedAt: null,
      revokedAt: null,
      updatedAt: properties.createdAt,
    });
  }

  public static restore(properties: PasskeyProperties): Passkey {
    return new Passkey(properties);
  }

  public recordUse(input: {
    backedUp: boolean;
    counter: number;
    deviceType: PasskeyDeviceType;
    now: Date;
  }): Passkey {
    if (input.counter < 0) {
      throw new RangeError("A passkey counter cannot be negative.");
    }

    return this.copy({
      backedUp: input.backedUp,
      counter: input.counter,
      deviceType: input.deviceType,
      lastUsedAt: input.now,
      updatedAt: input.now,
    });
  }

  public rename(name: string, now: Date): Passkey {
    return this.copy({ ...normalizeName(name), updatedAt: now });
  }

  public revoke(now: Date): Passkey {
    return this.revokedAt
      ? this
      : this.copy({ revokedAt: now, updatedAt: now });
  }

  private copy(changes: Partial<PasskeyProperties>): Passkey {
    return new Passkey({ ...this.toProperties(), ...changes });
  }

  public toProperties(): PasskeyProperties {
    return {
      backedUp: this.backedUp,
      canonicalName: this.canonicalName,
      counter: this.counter,
      createdAt: this.createdAt,
      credentialId: this.credentialId,
      credentialPublicKey: this.credentialPublicKey,
      deviceType: this.deviceType,
      id: this.id,
      lastUsedAt: this.lastUsedAt,
      name: this.name,
      revokedAt: this.revokedAt,
      transports: this.transports,
      updatedAt: this.updatedAt,
      userHandle: this.userHandle,
      userId: this.userId,
    };
  }
}
