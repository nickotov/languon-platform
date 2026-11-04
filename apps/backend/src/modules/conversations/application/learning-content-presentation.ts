import {
    AssistantLanguageSchema,
    type ChatPreferences,
} from '@languon/contracts';
import {
    LearningContentBriefSchema,
    learningContentCapabilities,
    type LearningContentBrief,
    type LearningContentLimitationCode,
} from './learning-content-contract';
import { learningContentLimitationCopy } from './learning-content-limitations';

export interface LearningContentAppliedDefault {
    taskId: string;
    kind: 'vocabulary' | 'exercises';
    count?: number;
    formats?: string[];
}

/** Normalize once at the host boundary while retaining which choices were omitted. */
export function normalizeLearningContentDefaults(
    candidate: LearningContentBrief,
) {
    const appliedDefaults: LearningContentAppliedDefault[] = [];
    const original = LearningContentBriefSchema.parse(candidate);
    const brief = LearningContentBriefSchema.parse({
        tasks: original.tasks.map((task) => {
            const capability = learningContentCapabilities.find(
                (item) => item.kind === task.kind,
            )!;

            if (task.kind !== 'vocabulary' && task.kind !== 'exercises') {
                return task;
            }

            const count =
                task.count ??
                (task.kind === 'vocabulary' && task.words
                    ? task.words.length
                    : capability.defaultCount);
            const formats =
                task.kind === 'exercises'
                    ? (task.formats ??
                      [
                          ...learningContentCapabilities.find(
                              (capability) => capability.kind === 'exercises',
                          )!.formats,
                      ].slice(0, count))
                    : undefined;
            const defaultCount =
                task.count === undefined &&
                !(task.kind === 'vocabulary' && task.words);
            const defaultFormats =
                task.kind === 'exercises' && task.formats === undefined;

            if (defaultCount || defaultFormats) {
                appliedDefaults.push({
                    taskId: task.id,
                    kind: task.kind,
                    ...(defaultCount ? { count } : {}),
                    ...(defaultFormats && formats ? { formats } : {}),
                });
            }

            return { ...task, count, ...(formats ? { formats } : {}) };
        }),
    });

    return { brief, appliedDefaults };
}

interface PresentationCopy {
    ready: string;
    unsupported: string;
    defaults: string;
    vocabularyCount: string;
    exerciseCount: string;
    formats: string;
    formatNames: readonly [string, string, string];
}

const copy: Record<string, PresentationCopy> = {
    en: {
        ready: 'Your learning material is ready to review. Apply the proposal to change your draft; Save publishes it.',
        unsupported:
            'This combination is not supported. Choose vocabulary, grammar, bilingual text, or multiple-choice, gap-fill and free-text exercises. Split requests that need more than 25 blocks.',
        defaults: 'Defaults used',
        vocabularyCount: 'Vocabulary entries',
        exerciseCount: 'Exercises',
        formats: 'Exercise formats',
        formatNames: ['multiple choice', 'gap fill', 'free text'],
    },
    ru: {
        ready: 'Учебный материал готов к проверке. Применение предложения изменит черновик; сохранение опубликует его.',
        unsupported:
            'Такое сочетание пока не поддерживается. Выберите словарь, грамматику, двуязычный текст или упражнения с выбором ответа, заполнением пропусков и свободным ответом. Запросы более чем на 25 блоков разделите на части.',
        defaults: 'Использованы настройки по умолчанию',
        vocabularyCount: 'Словарные статьи',
        exerciseCount: 'Упражнения',
        formats: 'Форматы упражнений',
        formatNames: [
            'выбор ответа',
            'заполнение пропусков',
            'свободный ответ',
        ],
    },
    es: {
        ready: 'El material está listo para revisar. Aplicar la propuesta modifica el borrador; guardarlo lo publica.',
        unsupported:
            'Esta combinación no está disponible. Elige vocabulario, gramática, texto bilingüe o ejercicios de opción múltiple, completar huecos y respuesta libre. Divide las solicitudes de más de 25 bloques.',
        defaults: 'Valores predeterminados utilizados',
        vocabularyCount: 'Entradas de vocabulario',
        exerciseCount: 'Ejercicios',
        formats: 'Formatos de ejercicios',
        formatNames: ['opción múltiple', 'completar huecos', 'respuesta libre'],
    },
    fr: {
        ready: 'Le contenu est prêt à être relu. Appliquer la proposition modifie le brouillon ; enregistrer le publie.',
        unsupported:
            'Cette combinaison n’est pas prise en charge. Choisissez du vocabulaire, de la grammaire, un texte bilingue ou des exercices à choix multiple, à trous et à réponse libre. Divisez les demandes de plus de 25 blocs.',
        defaults: 'Valeurs par défaut utilisées',
        vocabularyCount: 'Entrées de vocabulaire',
        exerciseCount: 'Exercices',
        formats: 'Formats des exercices',
        formatNames: ['choix multiple', 'texte à trous', 'réponse libre'],
    },
    de: {
        ready: 'Das Lernmaterial ist zur Prüfung bereit. Das Übernehmen ändert den Entwurf; Speichern veröffentlicht ihn.',
        unsupported:
            'Diese Kombination wird nicht unterstützt. Wähle Wortschatz, Grammatik, zweisprachigen Text oder Übungen mit Auswahlantworten, Lückentext und freier Antwort. Teile Anfragen mit mehr als 25 Blöcken auf.',
        defaults: 'Verwendete Standardwerte',
        vocabularyCount: 'Wortschatzeinträge',
        exerciseCount: 'Übungen',
        formats: 'Übungsformate',
        formatNames: ['Auswahlantwort', 'Lückentext', 'freie Antwort'],
    },
    ar: {
        ready: 'المادة التعليمية جاهزة للمراجعة. تطبيق الاقتراح يغيّر المسودة، وحفظها ينشرها.',
        unsupported:
            'هذا الجمع غير مدعوم. اختر مفردات أو قواعد أو نصًا ثنائي اللغة أو تمارين اختيار متعدد وملء فراغات وإجابة حرة. قسّم الطلبات التي تتجاوز 25 كتلة.',
        defaults: 'الإعدادات الافتراضية المستخدمة',
        vocabularyCount: 'مفردات',
        exerciseCount: 'تمارين',
        formats: 'أنواع التمارين',
        formatNames: ['اختيار متعدد', 'ملء الفراغات', 'إجابة حرة'],
    },
    he: {
        ready: 'חומר הלימוד מוכן לבדיקה. החלת ההצעה משנה את הטיוטה; שמירה מפרסמת אותה.',
        unsupported:
            'השילוב הזה אינו נתמך. בחרו אוצר מילים, דקדוק, טקסט דו־לשוני או תרגילי בחירה, השלמת חסרים ותשובה חופשית. פצלו בקשות של יותר מ־25 בלוקים.',
        defaults: 'ברירות המחדל שנבחרו',
        vocabularyCount: 'ערכי אוצר מילים',
        exerciseCount: 'תרגילים',
        formats: 'סוגי תרגילים',
        formatNames: ['בחירה מרובה', 'השלמת חסרים', 'תשובה חופשית'],
    },
    hi: {
        ready: 'अध्ययन सामग्री समीक्षा के लिए तैयार है। प्रस्ताव लागू करने से मसौदा बदलेगा; सहेजने से वह प्रकाशित होगा।',
        unsupported:
            'यह संयोजन समर्थित नहीं है। शब्दावली, व्याकरण, द्विभाषी पाठ या बहुविकल्पीय, रिक्त स्थान और मुक्त उत्तर वाले अभ्यास चुनें। 25 से अधिक ब्लॉक वाले अनुरोध बाँटें।',
        defaults: 'इस्तेमाल किए गए डिफ़ॉल्ट',
        vocabularyCount: 'शब्दावली प्रविष्टियाँ',
        exerciseCount: 'अभ्यास',
        formats: 'अभ्यास के प्रकार',
        formatNames: ['बहुविकल्पीय', 'रिक्त स्थान', 'मुक्त उत्तर'],
    },
    it: {
        ready: 'Il materiale è pronto per la revisione. Applicare la proposta modifica la bozza; salvarla la pubblica.',
        unsupported:
            'Questa combinazione non è supportata. Scegli vocabolario, grammatica, testo bilingue o esercizi a scelta multipla, con spazi da completare e a risposta libera. Dividi le richieste di oltre 25 blocchi.',
        defaults: 'Valori predefiniti utilizzati',
        vocabularyCount: 'Voci di vocabolario',
        exerciseCount: 'Esercizi',
        formats: 'Formati degli esercizi',
        formatNames: ['scelta multipla', 'completamento', 'risposta libera'],
    },
    ja: {
        ready: '学習教材を確認できます。提案を適用すると下書きが変更され、保存すると公開されます。',
        unsupported:
            'この組み合わせには対応していません。語彙、文法、対訳文、選択式・穴埋め・自由記述の練習を選んでください。25ブロックを超える依頼は分割してください。',
        defaults: '使用した既定値',
        vocabularyCount: '語彙項目数',
        exerciseCount: '練習問題数',
        formats: '練習形式',
        formatNames: ['選択式', '穴埋め', '自由記述'],
    },
    ko: {
        ready: '학습 자료를 검토할 수 있습니다. 제안을 적용하면 초안이 바뀌고, 저장하면 게시됩니다.',
        unsupported:
            '이 조합은 지원되지 않습니다. 어휘, 문법, 이중 언어 텍스트 또는 객관식·빈칸 채우기·자유 응답 연습을 선택하세요. 25개 블록이 넘는 요청은 나누어 주세요.',
        defaults: '적용된 기본값',
        vocabularyCount: '어휘 항목 수',
        exerciseCount: '연습 문제 수',
        formats: '연습 형식',
        formatNames: ['객관식', '빈칸 채우기', '자유 응답'],
    },
    pl: {
        ready: 'Materiał jest gotowy do sprawdzenia. Zastosowanie propozycji zmienia szkic; zapisanie go publikuje.',
        unsupported:
            'To połączenie nie jest obsługiwane. Wybierz słownictwo, gramatykę, tekst dwujęzyczny albo ćwiczenia wyboru, z lukami i z odpowiedzią otwartą. Podziel prośby obejmujące ponad 25 bloków.',
        defaults: 'Użyte ustawienia domyślne',
        vocabularyCount: 'Hasła słownictwa',
        exerciseCount: 'Ćwiczenia',
        formats: 'Formaty ćwiczeń',
        formatNames: [
            'wybór odpowiedzi',
            'uzupełnianie luk',
            'odpowiedź otwarta',
        ],
    },
    pt: {
        ready: 'O material está pronto para revisão. Aplicar a proposta altera o rascunho; salvar publica o conteúdo.',
        unsupported:
            'Esta combinação não é suportada. Escolha vocabulário, gramática, texto bilíngue ou exercícios de múltipla escolha, lacunas e resposta livre. Divida pedidos com mais de 25 blocos.',
        defaults: 'Padrões utilizados',
        vocabularyCount: 'Entradas de vocabulário',
        exerciseCount: 'Exercícios',
        formats: 'Formatos dos exercícios',
        formatNames: [
            'múltipla escolha',
            'preenchimento de lacunas',
            'resposta livre',
        ],
    },
    tr: {
        ready: 'Öğrenme materyali incelemeye hazır. Öneriyi uygulamak taslağı değiştirir; kaydetmek yayımlar.',
        unsupported:
            'Bu birleşim desteklenmiyor. Sözcükler, dil bilgisi, iki dilli metin veya çoktan seçmeli, boşluk doldurma ve serbest yanıt alıştırmaları seçin. 25 bloktan uzun istekleri bölün.',
        defaults: 'Kullanılan varsayılanlar',
        vocabularyCount: 'Sözcük sayısı',
        exerciseCount: 'Alıştırma sayısı',
        formats: 'Alıştırma biçimleri',
        formatNames: ['çoktan seçmeli', 'boşluk doldurma', 'serbest yanıt'],
    },
    uk: {
        ready: 'Навчальний матеріал готовий до перевірки. Застосування пропозиції змінить чернетку; збереження опублікує її.',
        unsupported:
            'Таке поєднання не підтримується. Виберіть словник, граматику, двомовний текст або вправи з вибором відповіді, заповненням пропусків і вільною відповіддю. Запити понад 25 блоків розділіть на частини.',
        defaults: 'Використано типові налаштування',
        vocabularyCount: 'Словникові статті',
        exerciseCount: 'Вправи',
        formats: 'Формати вправ',
        formatNames: [
            'вибір відповіді',
            'заповнення пропусків',
            'вільна відповідь',
        ],
    },
    zh: {
        ready: '学习材料已准备好，请先查看。应用建议会修改草稿，保存后才会发布。',
        unsupported:
            '暂不支持这种组合。请选择词汇、语法、双语文本，或选择题、填空题和自由作答练习。超过25个内容块的请求请拆分。',
        defaults: '采用的默认设置',
        vocabularyCount: '词汇条目数',
        exerciseCount: '练习题数',
        formats: '练习形式',
        formatNames: ['选择题', '填空题', '自由作答'],
    },
};

export const learningContentReplyLanguageSchema =
    AssistantLanguageSchema.refine(
        (language) => copy[language.toLowerCase().split('-')[0]!] !== undefined,
        'The reply language must have supported product copy.',
    );

function presentationLanguage(
    preferences: ChatPreferences,
    message: string,
    replyLanguage?: string,
) {
    const language =
        preferences.replyLanguage === 'auto'
            ? replyLanguage
            : preferences.replyLanguage;
    const base = language?.toLowerCase().split('-')[0];

    // The resolver supplies the substantive question language in Auto. The script
    // fallback supports old/synthetic resolutions without consulting interface locale.
    return base ?? (/\p{Script=Cyrillic}/u.test(message) ? 'ru' : 'en');
}

/** Product copy derives from host defaults, never from a model's optional acknowledgement. */
export function learningContentPresentation(input: {
    status: 'ready' | 'unsupported' | 'needs-clarification';
    brief: LearningContentBrief;
    preferences: ChatPreferences;
    message: string;
    replyLanguage?: string;
    appliedDefaults?: LearningContentAppliedDefault[];
    limitationCode?: LearningContentLimitationCode;
}): string {
    const language = presentationLanguage(
        input.preferences,
        input.message,
        input.replyLanguage,
    );

    const labels = copy[language] ?? copy.en!;
    if (input.status !== 'ready' && input.limitationCode) {
        return learningContentLimitationCopy(language, input.limitationCode);
    }

    if (input.status !== 'ready') {
        return labels.unsupported;
    }

    const appliedDefaults =
        input.appliedDefaults ??
        normalizeLearningContentDefaults(input.brief).appliedDefaults;
    const descriptions = appliedDefaults.flatMap((defaults) => {
        const values: string[] = [];
        if (defaults.count !== undefined) {
            values.push(
                `${defaults.kind === 'vocabulary' ? labels.vocabularyCount : labels.exerciseCount}: ${defaults.count}`,
            );
        }

        if (defaults.formats) {
            const supported = learningContentCapabilities.find(
                (capability) => capability.kind === 'exercises',
            )!.formats;

            values.push(
                `${labels.formats}: ${defaults.formats.map((format) => labels.formatNames[supported.indexOf(format as (typeof supported)[number])] ?? format).join(', ')}`,
            );
        }

        return values;
    });

    return descriptions.length
        ? `${labels.ready}\n\n${labels.defaults}: ${descriptions.join('; ')}.`
        : labels.ready;
}
