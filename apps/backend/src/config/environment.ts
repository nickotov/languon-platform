import { z } from "zod";

const EnvironmentSchema = z.object({
  BACKEND_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z
    .url()
    .default("postgres://languon:languon-local@localhost:5432/languon"),
  LANGFUSE_BASE_URL: z.url().default("https://cloud.langfuse.com"),
  LANGFUSE_PUBLIC_KEY: z.string().min(1).optional(),
  LANGFUSE_SECRET_KEY: z.string().min(1).optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  REDIS_URL: z.url().default("redis://localhost:6379"),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export function loadEnvironment(
  values: NodeJS.ProcessEnv = process.env,
): Environment {
  return EnvironmentSchema.parse(values);
}
