import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  VerificationCodeBinding,
  VerificationCodeDigestCandidate,
  VerificationCodeDigester,
} from "../../application/ports/code-digester";

const minimumSecretBytes = 32;
const digestPrefix = "hmac-sha256:v1:";

export class HmacVerificationCodeDigester implements VerificationCodeDigester {
  private readonly secret: Buffer;

  public constructor(secret: string | Uint8Array) {
    this.secret = Buffer.from(secret);

    if (this.secret.byteLength < minimumSecretBytes) {
      throw new RangeError(
        `The verification-code HMAC secret must contain at least ${minimumSecretBytes} bytes.`,
      );
    }
  }

  public digest(binding: VerificationCodeBinding): string {
    const digest = createHmac("sha256", this.secret)
      .update(serializeBinding(binding), "utf8")
      .digest("base64url");

    return `${digestPrefix}${digest}`;
  }

  public matches(candidate: VerificationCodeDigestCandidate): boolean {
    const expected = Buffer.from(this.digest(candidate), "utf8");
    const supplied = Buffer.from(candidate.digest, "utf8");

    return (
      expected.byteLength === supplied.byteLength &&
      timingSafeEqual(expected, supplied)
    );
  }
}

function serializeBinding(binding: VerificationCodeBinding): string {
  return [
    "verification-code:v1",
    encodeField(binding.purpose),
    encodeField(binding.userId),
    encodeField(binding.flowId),
    encodeField(binding.code),
  ].join("|");
}

function encodeField(value: string): string {
  return `${Buffer.byteLength(value, "utf8")}:${value}`;
}
