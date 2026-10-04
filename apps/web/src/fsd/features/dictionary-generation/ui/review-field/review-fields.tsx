import type {
    DictionaryGenerationCandidate,
    DictionaryGenerationField,
    DictionarySingleCardGenerationJob,
    LanguageCatalogEntry,
} from '@languon/contracts';

import { FIELD_KEYS } from '../../lib/review-fields';
import styles from '../dictionary-generation-panel-common.module.css';
import { ReviewField } from './review-field';

export function ReviewFields({
    candidate,
    job,
    languages,
    onChange,
}: {
    candidate: DictionaryGenerationCandidate;
    job: DictionarySingleCardGenerationJob;
    languages: readonly LanguageCatalogEntry[];
    onChange(field: DictionaryGenerationField, value: string): void;
}) {
    const settings = job.originalSnapshot!.effectiveSettings;

    const overrides = candidate.overrides;

    const exampleEnabled = enabled(
        overrides.exampleEnabled,
        settings.exampleEnabled,
    );

    const visible = {
        source: true,
        translation: true,
        transcription: enabled(
            overrides.transcriptionEnabled,
            settings.transcriptionEnabled,
        ),
        definition: enabled(
            overrides.definitionEnabled,
            settings.definitionEnabled,
        ),
        example: exampleEnabled,
        exampleTranslation:
            exampleEnabled &&
            enabled(
                overrides.exampleTranslationEnabled,
                settings.exampleTranslationEnabled,
            ),
    };

    const fields = FIELD_KEYS.filter((field) => visible[field]);

    return (
        <div className={styles.fields}>
            {fields.map((field) => (
                <ReviewField
                    candidate={candidate}
                    field={field}
                    job={job}
                    key={field}
                    languages={languages}
                    onChange={onChange}
                />
            ))}
        </div>
    );
}

function enabled(override: 'enabled' | 'disabled' | null, fallback: boolean) {
    return override === null ? fallback : override === 'enabled';
}
