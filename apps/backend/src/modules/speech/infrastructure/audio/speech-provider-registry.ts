import type { SpeechSynthesisProvider } from '../../application/ports/speech-synthesis-provider';
import type { DictionaryAudioEnvironment } from './dictionary-audio-environment';
import {
    FixtureSpeechProvider,
    KieSpeechProvider,
    findConfiguredSpeechProfile,
} from './speech-providers';

export type SpeechProfileResolver = Pick<
    SpeechSynthesisProvider,
    'configurationId' | 'supports'
>;
type ProviderDefinition = {
    resolve(environment: DictionaryAudioEnvironment): SpeechProfileResolver;
    create(environment: DictionaryAudioEnvironment): SpeechSynthesisProvider;
};

/** Add providers here behind the same port; API metadata never constructs paid adapters. */
const providers: Readonly<Record<string, ProviderDefinition>> = Object.freeze({
    fixture: {
        resolve: (env) => {
            const fixture = new FixtureSpeechProvider();
            return {
                configurationId: fixture.configurationId,
                supports: (language) =>
                    !env.fixtureSupportedLanguages ||
                    env.fixtureSupportedLanguages.includes(language)
                        ? fixture.supports(language)
                        : null,
            };
        },
        create: (env) => {
            const fixture = new FixtureSpeechProvider();
            return {
                ...providers.fixture!.resolve(env),
                submit: fixture.submit.bind(fixture),
                poll: fixture.poll.bind(fixture),
            };
        },
    },
    kie: {
        resolve: (env) => ({
            configurationId: env.configurationId,
            supports: (language) =>
                findConfiguredSpeechProfile(env.profiles, language),
        }),
        create: (env) =>
            new KieSpeechProvider({
                configurationId: env.configurationId,
                apiKey: env.apiKey ?? '',
                profiles: env.profiles,
                allowedDownloadHosts: env.allowedDownloadHosts,
            }),
    },
});

export function resolveSpeechProvider(
    environment: DictionaryAudioEnvironment,
): SpeechProfileResolver {
    const definition = providers[environment.provider];
    if (!definition) throw new Error('Unsupported speech provider.');
    return definition.resolve(environment);
}
export function createSpeechProvider(
    environment: DictionaryAudioEnvironment,
): SpeechSynthesisProvider {
    const definition = providers[environment.provider];
    if (!definition) throw new Error('Unsupported speech provider.');
    return definition.create(environment);
}
