import styles from '../../ai-settings-page.module.css';
import type { AiProviderOption } from '../../types';
import { ProviderCard } from '../provider-card/provider-card';

interface EnabledModelsFieldProps {
    defaultModel: string | undefined;
    onChange?(modelIds: string[]): void;
    onDefaultRemoved(): void;
    providers: AiProviderOption[];
    value?: string[];
}

export function EnabledModelsField({
    defaultModel,
    onChange,
    onDefaultRemoved,
    providers,
    value = [],
}: EnabledModelsFieldProps) {
    const handleChange = (modelIds: string[]) => {
        onChange?.(modelIds);
        if (defaultModel && !modelIds.includes(defaultModel)) {
            onDefaultRemoved();
        }
    };

    return (
        <div className={styles.providerGrid}>
            {providers.map((provider) => (
                <ProviderCard
                    enabledModelIds={value}
                    key={provider.id}
                    onEnabledModelsChange={handleChange}
                    provider={provider}
                />
            ))}
        </div>
    );
}
