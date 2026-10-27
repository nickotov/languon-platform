export {
    loadEnvironment,
    insecureFixedCodeStagingAcknowledgement,
    type Environment,
    type AuthEmailDeliveryMode,
    type AuthVerificationCodeMode,
} from './api-environment';

// Public backend configuration entry point. Process-specific loaders stay lazy:
// importing this module neither reads environment values nor starts services.
export {
    loadDictionaryWorkerEnvironment,
    type DictionaryWorkerEnvironment,
} from '../infrastructure/worker/dictionary-worker-environment';
export { loadAccountPurgeEnvironment } from '../infrastructure/worker/account-purge-environment';
export { loadMigrationDatabaseUrl } from '../infrastructure/database/migration-environment';
export { loadPlaygroundEnvironment } from '../infrastructure/playground/playground-environment';
export { loadDictionaryAudioEnvironment } from '../modules/speech/infrastructure/audio/dictionary-audio-environment';
export { loadAccountDeletionJournalEnvironment } from '../modules/users/infrastructure/recovery/account-deletion-journal-environment';
export { loadDictionaryDocumentS3Environment } from '../modules/dictionaries/infrastructure/document/dictionary-document-environment';
export { defaultAiGenerationTimeoutMs } from './ai-generation-environment';
export { type EnvironmentDiagnostics } from './environment-diagnostics';
export { loadDictionaryGenerationProviderBudgetPolicy } from '../modules/dictionaries/infrastructure/dictionary-generation-provider-policy';

export { loadTextAiProviderCredentials } from './text-ai-provider-environment';
export { loadTextAiProbeEnvironment } from './text-ai-probe-environment';
export { adminProbeFixtureEnabled } from './admin-probe-fixture-environment';
export { loadAdminMcpEnvironment } from './admin-mcp-environment';
