export const resourceProfileConfig = {
    profileVersion: 'production-v1',
    builds: [
        ['backend', 'infra/docker/prod.backend.Dockerfile'],
        ['web', 'infra/docker/prod.web.Dockerfile'],
        ['admin', 'infra/docker/prod.admin.Dockerfile'],
        ['migrator', 'infra/docker/prod.migrator.Dockerfile'],
    ].map(([service, dockerfile]) => ({
        service,
        context: '.',
        dockerfile,
        image: `languon-resource-profile/${service}:local`,
    })),
    runtime: {
        projectName: 'languon-resource-profile',
        urls: [
            'https://localhost:18480/healthz',
            'https://localhost:18480/api/readyz',
        ],
        idleSeconds: 10,
        loadSeconds: 20,
        concurrency: 10,
        sampleIntervalMs: 1_000,
    },
};
