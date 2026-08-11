import { Mastra } from "@mastra/core/mastra";

/**
 * Register agents and workflows here as product modules are introduced.
 * Keeping the runtime in infrastructure prevents AI SDK types from leaking
 * into domain and application layers.
 */
export const mastra = new Mastra({});
