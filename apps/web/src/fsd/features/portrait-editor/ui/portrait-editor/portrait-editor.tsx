'use client';
import type { PortraitItems } from '@languon/contracts';
import { useI18n, type Locale } from '@/fsd/shared/i18n';
import { GOALS, NEEDS, INTERESTS } from '../../lib/options';
import { labels, copy } from '../../lib/copy';
import { EditorSection } from '../editor-controls/editor-controls';
import { LanguagesEditor } from '../languages-editor/languages-editor';
import {
    StyleFields,
    PreferenceField,
    type PreferenceKey,
} from '../preference-fields/preference-fields';
import styles from '../common.module.css';
import { ListSection } from '../list-section/list-section';
import { ExplanationSection } from '../explanation-section/explanation-section';
import { ConfirmedNotesEditor } from '../confirmed-notes-editor/confirmed-notes-editor';
export function PortraitEditor({
    items,
    onChange,
    disabled = false,
    locale: requestedLocale,
}: {
    items: PortraitItems;
    onChange: (items: PortraitItems) => void;
    disabled?: boolean;
    locale?: Locale;
}) {
    const { locale: interfaceLocale } = useI18n();
    const locale = requestedLocale ?? interfaceLocale;
    const text = labels[locale];
    const styleCount = [
        items.tone,
        items.detail,
        items.wording,
        items.approach,
    ].filter(Boolean).length;
    function handleLanguages(languages: PortraitItems['languages']) {
        onChange({ ...items, languages });
    }
    function handleAge(field: PreferenceKey, value: string) {
        const next = { ...items };
        if (value) Object.assign(next, { [field]: value });
        else delete next[field];
        onChange(next);
    }
    const languageDescription = copy(
        locale,
        'Languages you know, which you’re learning now, and how you’d describe each.',
        'Языки, которые вы знаете или изучаете, и ваше описание уровня.',
        'Les langues que vous connaissez ou apprenez et votre description de chacune.',
        'Los idiomas que conoces o estudias y cómo describirías cada uno.',
    );
    const explanationDescription = copy(
        locale,
        'Languages that feel comfortable for explanations. Separate from the app’s interface language and from what you’re studying.',
        'Удобные языки объяснений. Они не зависят от языка интерфейса и изучаемого языка.',
        'Les langues adaptées aux explications, indépendantes de l’interface et des langues étudiées.',
        'Idiomas cómodos para explicaciones, independientes de la interfaz y de lo que estudias.',
    );
    const needsDescription = copy(
        locale,
        'Accommodations that help — no need to say why. Diagnostic labels aren’t saved.',
        'Что помогает вам учиться — причину указывать не нужно. Диагнозы не сохраняются.',
        'Les aménagements utiles, sans devoir expliquer pourquoi. Les diagnostics ne sont pas enregistrés.',
        'Apoyos útiles sin necesidad de explicar por qué. No se guardan diagnósticos.',
    );
    const optionalDescription = copy(
        locale,
        'Used only to make examples more relevant.',
        'Только для более подходящих примеров.',
        'Uniquement pour des exemples plus pertinents.',
        'Solo para que los ejemplos sean más relevantes.',
    );
    return (
        <div className={styles.stack}>
            <EditorSection
                title={text.languages}
                description={languageDescription}
                count={items.languages.length}
                locale={locale}
            >
                <LanguagesEditor
                    languages={items.languages}
                    onChange={handleLanguages}
                    locale={locale}
                    disabled={disabled}
                />
            </EditorSection>
            <ExplanationSection
                items={items}
                onChange={onChange}
                locale={locale}
                description={explanationDescription}
                disabled={disabled}
            />
            <EditorSection
                title={text.goals}
                count={items.goals.length}
                locale={locale}
            >
                <ListSection
                    field='goals'
                    items={items}
                    onChange={onChange}
                    options={GOALS}
                    locale={locale}
                    disabled={disabled}
                />
            </EditorSection>
            <EditorSection
                title={text.style}
                description={copy(
                    locale,
                    'Each choice is independent.',
                    'Каждый выбор независим.',
                    'Chaque choix est indépendant.',
                    'Cada elección es independiente.',
                )}
                count={styleCount}
                locale={locale}
            >
                <StyleFields
                    items={items}
                    onChange={onChange}
                    locale={locale}
                    disabled={disabled}
                />
            </EditorSection>
            <EditorSection
                title={text.accommodations}
                description={needsDescription}
                count={items.accommodations.length}
                locale={locale}
            >
                <ListSection
                    field='accommodations'
                    items={items}
                    onChange={onChange}
                    options={NEEDS}
                    locale={locale}
                    disabled={disabled}
                />
            </EditorSection>
            <EditorSection
                title={copy(
                    locale,
                    'Interests and age range',
                    'Интересы и возрастная группа',
                    'Centres d’intérêt et tranche d’âge',
                    'Intereses y franja de edad',
                )}
                optional
                description={optionalDescription}
                count={
                    items.hobbies.length +
                    Number(
                        Boolean(
                            items.ageRange &&
                            items.ageRange !== 'prefer-not-to-say',
                        ),
                    )
                }
                locale={locale}
            >
                <ListSection
                    field='hobbies'
                    items={items}
                    onChange={onChange}
                    options={INTERESTS}
                    locale={locale}
                    disabled={disabled}
                />
                <PreferenceField
                    field='ageRange'
                    value={items.ageRange}
                    onChange={handleAge}
                    locale={locale}
                    disabled={disabled}
                />
            </EditorSection>
            <ConfirmedNotesEditor
                items={items}
                onChange={onChange}
                locale={locale}
                disabled={disabled}
            />
        </div>
    );
}
