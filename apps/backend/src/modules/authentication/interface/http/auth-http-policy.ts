import { BlockList, isIP } from "node:net";

export type AuthHttpAppEnvironment =
  "development" | "production" | "staging" | "test";

export interface AuthHttpPolicyOptions {
  allowedOrigins: readonly string[];
  appEnvironment: AuthHttpAppEnvironment;
  now?: () => Date;
  refreshTokenTtlSeconds: number;
  trustProxy?: boolean;
  trustedProxyCidrs?: readonly string[];
}

export class InvalidRequestOriginError extends Error {
  public constructor() {
    super("The request origin is not allowed.");
    this.name = "InvalidRequestOriginError";
  }
}

export class InvalidBearerAuthorizationError extends Error {
  public constructor() {
    super("A valid Bearer authorization value is required.");
    this.name = "InvalidBearerAuthorizationError";
  }
}

export class AuthHttpPolicy {
  private readonly allowedOrigins: ReadonlySet<string>;
  private readonly trustedProxies = new BlockList();

  public constructor(private readonly options: AuthHttpPolicyOptions) {
    this.allowedOrigins = new Set(options.allowedOrigins);
    if (options.trustProxy && !options.trustedProxyCidrs?.length) {
      throw new Error(
        "Trusted proxy CIDRs are required when proxy forwarding is enabled.",
      );
    }
    for (const cidr of options.trustedProxyCidrs ?? []) {
      this.addTrustedProxyCidr(cidr);
    }
  }

  public assertCookieRequestOrigin(origin: string | null): void {
    if (!origin || !this.allowedOrigins.has(origin)) {
      throw new InvalidRequestOriginError();
    }
  }

  public createRefreshCookie(
    refreshToken: string,
    absoluteExpiresAt?: Date | string,
  ): string {
    const configuredMaximum = this.options.refreshTokenTtlSeconds;
    const maxAge = absoluteExpiresAt
      ? Math.min(
          configuredMaximum,
          Math.max(
            0,
            Math.ceil(
              (new Date(absoluteExpiresAt).getTime() -
                (this.options.now?.() ?? new Date()).getTime()) /
                1_000,
            ),
          ),
        )
      : configuredMaximum;
    return this.serializeRefreshCookie(refreshToken, maxAge);
  }

  public refreshCookieName(): string {
    return this.productionLike() ? "__Host-languon_refresh" : "languon_refresh";
  }

  public clearRefreshCookie(): string {
    return this.serializeRefreshCookie("", 0);
  }

  public parseBearerAuthorization(value: string | null): string {
    const match =
      /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(
        value ?? "",
      );
    if (!match?.[1]) {
      throw new InvalidBearerAuthorizationError();
    }
    return match[1];
  }

  public securityHeaders(): Readonly<Record<string, string>> {
    return {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    };
  }

  public clientAddress(
    directAddress: string,
    forwardedFor: string | null,
  ): string {
    if (
      !this.options.trustProxy ||
      !forwardedFor ||
      !this.isTrustedProxy(directAddress) ||
      forwardedFor.length > 1_024
    ) {
      return directAddress;
    }

    const chain = forwardedFor.split(",").map((value) => value.trim());
    if (chain.length === 0 || chain.length > 16) {
      return directAddress;
    }

    // Walk from the immediate upstream proxy toward the client. This returns
    // the first address not controlled by a configured trusted proxy and makes
    // attacker-prepended X-Forwarded-For values irrelevant.
    let clientAddress = directAddress;
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      const candidate = chain[index];
      if (!candidate || !this.validIpAddress(candidate)) return directAddress;
      clientAddress = candidate;
      if (!this.isTrustedProxy(candidate)) return candidate;
    }
    return clientAddress;
  }

  private addTrustedProxyCidr(value: string): void {
    const [address, rawPrefix, ...extra] = value.split("/");
    const family = address ? isIP(address) : 0;
    if (!address || extra.length > 0 || family === 0) {
      throw new Error(`Invalid trusted proxy CIDR: ${value}`);
    }
    if (rawPrefix === undefined) {
      this.trustedProxies.addAddress(address, family === 4 ? "ipv4" : "ipv6");
      return;
    }
    if (!/^\d+$/.test(rawPrefix)) {
      throw new Error(`Invalid trusted proxy CIDR: ${value}`);
    }
    const prefix = Number(rawPrefix);
    const maximumPrefix = family === 4 ? 32 : 128;
    if (prefix > maximumPrefix) {
      throw new Error(`Invalid trusted proxy CIDR: ${value}`);
    }
    this.trustedProxies.addSubnet(
      address,
      prefix,
      family === 4 ? "ipv4" : "ipv6",
    );
  }

  private isTrustedProxy(address: string): boolean {
    const family = isIP(address);
    return (
      family !== 0 &&
      this.trustedProxies.check(address, family === 4 ? "ipv4" : "ipv6")
    );
  }

  private validIpAddress(address: string): boolean {
    return address.length <= 64 && isIP(address) !== 0;
  }

  private serializeRefreshCookie(value: string, maxAge: number): string {
    const productionLike = this.productionLike();
    const name = this.refreshCookieName();
    const attributes = [
      `${name}=${value}`,
      `Max-Age=${maxAge}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
    ];
    if (productionLike) {
      attributes.push("Secure");
    }
    return attributes.join("; ");
  }

  private productionLike(): boolean {
    return (
      this.options.appEnvironment === "production" ||
      this.options.appEnvironment === "staging"
    );
  }
}
