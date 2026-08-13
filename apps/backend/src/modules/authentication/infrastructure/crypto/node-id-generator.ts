import { randomUUID } from "node:crypto";

import type { IdGenerator } from "../../application/ports/id-generator";

export class NodeIdGenerator implements IdGenerator {
  public generate(): string {
    return randomUUID();
  }
}
