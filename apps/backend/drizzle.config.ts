import { defineConfig } from 'drizzle-kit';

const databaseUrl =
    process.env.DATABASE_URL ??
    'postgres://languon:languon-local@localhost:5432/languon';

export default defineConfig({
    dbCredentials: { url: databaseUrl },
    dialect: 'postgresql',
    out: './drizzle',
    schema: './src/infrastructure/database/schema.ts',
    strict: true,
    verbose: true,
});
