import { z } from 'zod';

const PostgresUrlSchema = z
    .url()
    .refine(
        (value) =>
            ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
        'Migration database URL must use PostgreSQL.',
    );

const MigrationEnvironmentSchema = z
    .object({
        APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
        DATABASE_URL: PostgresUrlSchema.optional(),
        MIGRATION_DATABASE_URL: PostgresUrlSchema.optional(),
    })
    .superRefine((value, context) => {
        const deployed =
            value.APP_ENV === 'staging' || value.APP_ENV === 'production';
        if (deployed && !value.MIGRATION_DATABASE_URL) {
            context.addIssue({
                code: 'custom',
                message:
                    'Deployed migrations require MIGRATION_DATABASE_URL with a dedicated one-connection credential.',
                path: ['MIGRATION_DATABASE_URL'],
            });
        } else if (!value.MIGRATION_DATABASE_URL && !value.DATABASE_URL) {
            context.addIssue({
                code: 'custom',
                message: 'Configure MIGRATION_DATABASE_URL or DATABASE_URL.',
                path: ['MIGRATION_DATABASE_URL'],
            });
        }
        const selected = value.MIGRATION_DATABASE_URL ?? value.DATABASE_URL;
        if (
            value.APP_ENV === 'production' &&
            selected &&
            new URL(selected).searchParams.get('sslmode') !== 'verify-full'
        ) {
            context.addIssue({
                code: 'custom',
                message: 'Production migrations require sslmode=verify-full.',
                path: ['MIGRATION_DATABASE_URL'],
            });
        }
    });

export function loadMigrationDatabaseUrl(values: NodeJS.ProcessEnv): string {
    const environment = MigrationEnvironmentSchema.parse(values);
    return environment.MIGRATION_DATABASE_URL ?? environment.DATABASE_URL!;
}
