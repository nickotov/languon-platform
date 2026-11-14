import type { LearningContentLimitationCode } from './learning-content-contract';

type ActivityLimitationCode =
    'activity-count-conflict' | 'activity-prerequisite' | 'task-dependency';

const messageIndex: Record<
    Exclude<LearningContentLimitationCode, ActivityLimitationCode>,
    number
> = {
    'single-block-task': 0,
    'exercise-format-only': 1,
    'unsupported-exercise-format': 2,
    'block-limit': 3,
    'word-count-conflict': 4,
    'output-capacity': 5,
};

const activityMessages: Record<
    ActivityLimitationCode,
    Record<string, string>
> = {
    'activity-count-conflict': {
        en: 'Selected activity counts do not match the total. Set a count for each activity and keep their sum equal to the total.',
        ru: 'Число вопросов по выбранным заданиям не совпадает с общим количеством. Укажите число для каждого задания так, чтобы сумма совпадала с общим количеством.',
        fr: 'Le nombre de questions par activité ne correspond pas au total. Précisez chaque nombre pour que leur somme soit égale au total.',
        es: 'Las cantidades de las actividades no coinciden con el total. Indica una cantidad por actividad cuya suma sea igual al total.',
        de: 'Die Anzahl je Aktivität stimmt nicht mit der Gesamtzahl überein. Gib für jede Aktivität eine Anzahl an, deren Summe der Gesamtzahl entspricht.',
        ar: 'أعداد الأسئلة للأنشطة لا تطابق المجموع. حدد عددًا لكل نشاط بحيث يساوي مجموعها العدد الكلي.',
        he: 'מספר השאלות בפעילויות אינו תואם לסך הכול. הגדירו מספר לכל פעילות כך שסכומם יתאים לסך הכול.',
        hi: 'गतिविधियों के प्रश्नों की संख्या कुल से मेल नहीं खाती। हर गतिविधि की संख्या तय करें ताकि उनका योग कुल के बराबर हो।',
        it: 'I conteggi delle attività non corrispondono al totale. Indica un numero per ogni attività la cui somma corrisponda al totale.',
        ja: '選択した活動の問題数と合計が一致しません。各活動の問題数を指定し、その和を合計に合わせてください。',
        ko: '선택한 활동의 문항 수가 전체 수와 다릅니다. 각 활동의 수를 지정하고 합계가 전체 수와 같도록 하세요.',
        pl: 'Liczby pytań w aktywnościach nie zgadzają się z sumą. Podaj liczbę dla każdej aktywności, aby ich suma odpowiadała całości.',
        pt: 'As quantidades das atividades não correspondem ao total. Defina uma quantidade por atividade cuja soma seja igual ao total.',
        tr: 'Etkinliklerin soru sayıları toplamla eşleşmiyor. Her etkinlik için bir sayı belirleyip toplamlarını genel toplamla eşitleyin.',
        uk: 'Кількість запитань за завданнями не збігається із загальною кількістю. Укажіть число для кожного завдання, щоб сума дорівнювала загальній кількості.',
        zh: '所选活动的题数与总数不一致。请设置每项活动的题数，使其总和等于总数。',
    },
    'activity-prerequisite': {
        en: 'This activity needs different source material or conflicts with the requested format. Select suitable material or clarify the activity choice.',
        ru: 'Для этого задания нужен другой исходный материал или оно несовместимо с выбранным форматом. Выберите подходящий материал или уточните задание.',
        fr: 'Cette activité nécessite une autre source ou contredit le format demandé. Choisissez une source adaptée ou précisez l’activité.',
        es: 'Esta actividad requiere otro material o contradice el formato solicitado. Elige un material adecuado o aclara la actividad.',
        de: 'Diese Aktivität benötigt anderes Ausgangsmaterial oder widerspricht dem gewünschten Format. Wähle geeignetes Material oder präzisiere die Aktivität.',
        ar: 'يتطلب هذا النشاط مادة مصدر مختلفة أو يتعارض مع التنسيق المطلوب. اختر مادة مناسبة أو وضح النشاط.',
        he: 'הפעילות דורשת חומר מקור אחר או סותרת את הפורמט המבוקש. בחרו חומר מתאים או הבהירו את הפעילות.',
        hi: 'इस गतिविधि के लिए दूसरी स्रोत सामग्री चाहिए या यह माँगे गए प्रारूप से मेल नहीं खाती। उपयुक्त सामग्री चुनें या गतिविधि स्पष्ट करें।',
        it: 'Questa attività richiede un altro materiale o contrasta con il formato richiesto. Scegli un materiale adatto o chiarisci l’attività.',
        ja: 'この活動には別の資料が必要か、指定された形式と一致しません。適切な資料を選ぶか、活動の指定を明確にしてください。',
        ko: '이 활동에는 다른 자료가 필요하거나 요청한 형식과 맞지 않습니다. 적절한 자료를 선택하거나 활동을 명확히 해 주세요.',
        pl: 'Ta aktywność wymaga innego materiału lub koliduje z wybranym formatem. Wybierz odpowiedni materiał lub doprecyzuj aktywność.',
        pt: 'Esta atividade precisa de outro material ou contradiz o formato solicitado. Escolha um material adequado ou esclareça a atividade.',
        tr: 'Bu etkinlik farklı kaynak materyal gerektiriyor veya istenen biçimle çelişiyor. Uygun materyal seçin ya da etkinliği netleştirin.',
        uk: 'Для цього завдання потрібен інший вихідний матеріал або воно несумісне з вибраним форматом. Виберіть придатний матеріал або уточніть завдання.',
        zh: '此活动需要其他来源材料，或与所选题型冲突。请选择合适的材料或明确活动选择。',
    },
    'task-dependency': {
        en: 'The exercise source must be an earlier vocabulary, grammar or reading task. Choose that source before generation.',
        ru: 'Источником упражнений должна быть предшествующая задача со словами, грамматикой или текстом. Выберите источник до генерации.',
        fr: 'La source doit être une tâche précédente de vocabulaire, de grammaire ou de lecture. Choisissez-la avant la génération.',
        es: 'La fuente debe ser una tarea anterior de vocabulario, gramática o lectura. Elígela antes de generar.',
        de: 'Die Quelle muss eine vorherige Wortschatz-, Grammatik- oder Leseaufgabe sein. Wähle diese Quelle vor der Generierung.',
        ar: 'يجب أن يكون المصدر مهمة سابقة للمفردات أو القواعد أو القراءة. اختر المصدر قبل التوليد.',
        he: 'המקור חייב להיות משימת אוצר מילים, דקדוק או קריאה קודמת. בחרו את המקור לפני היצירה.',
        hi: 'स्रोत पहले का शब्दावली, व्याकरण या पठन कार्य होना चाहिए। सामग्री बनाने से पहले वह स्रोत चुनें।',
        it: 'La fonte deve essere un’attività precedente di vocabolario, grammatica o lettura. Sceglila prima della generazione.',
        ja: '出典には先行する語彙・文法・読解のタスクを指定してください。生成前に出典を選んでください。',
        ko: '출처는 앞선 어휘, 문법 또는 읽기 작업이어야 합니다. 생성하기 전에 출처를 선택하세요.',
        pl: 'Źródłem musi być wcześniejsze zadanie słownictwa, gramatyki lub czytania. Wybierz je przed generowaniem.',
        pt: 'A fonte deve ser uma tarefa anterior de vocabulário, gramática ou leitura. Escolha-a antes de gerar.',
        tr: 'Kaynak, önceki bir sözcük, dil bilgisi veya okuma görevi olmalıdır. Üretimden önce bu kaynağı seçin.',
        uk: 'Джерелом вправ має бути попереднє завдання зі словами, граматикою або текстом. Виберіть джерело перед генерацією.',
        zh: '练习来源必须是之前的词汇、语法或阅读任务。请在生成前选择该来源。',
    },
};

const messages: Record<
    string,
    readonly [string, string, string, string, string, string]
> = {
    en: [
        'Each grammar or bilingual-text task creates one block. Request each additional block as a separate task.',
        'Format choices apply only to exercises. Request an exercise task for multiple-choice, gap-fill or free-text content.',
        'Choose distinct supported exercise formats: multiple choice, gap fill or free text. Which would you like?',
        'This request needs more than 25 blocks. Split it into smaller requests with no more than 25 blocks each.',
        'The vocabulary count conflicts with the word list, or the list contains duplicates. Keep all distinct words, or change the list or count?',
        'The complete material will not fit in one generation. Use fewer vocabulary entries, shorten the source text, or split the request. No words or passages have been omitted.',
    ],
    ru: [
        'Одна задача по грамматике или двуязычному тексту создаёт один блок. Для каждого дополнительного блока добавьте отдельную задачу.',
        'Форматы задаются только для упражнений. Для выбора ответа, заполнения пропусков или свободного ответа добавьте задачу с упражнениями.',
        'Выберите поддерживаемые форматы без повторов: выбор ответа, заполнение пропусков или свободный ответ. Какие вам нужны?',
        'Для этого запроса нужно больше 25 блоков. Разделите его на несколько запросов, не более 25 блоков в каждом.',
        'Количество словарных статей не совпадает со списком или в нём есть повторы. Сохранить все уникальные слова или изменить список либо количество?',
        'Весь материал не поместится в одну генерацию. Уменьшите число словарных статей, сократите исходный текст или разделите запрос. Слова и фрагменты не были пропущены.',
    ],
    es: [
        'Cada tarea de gramática o texto bilingüe crea un bloque. Pide cada bloque adicional como una tarea separada.',
        'Los formatos se aplican solo a ejercicios. Pide ejercicios de opción múltiple, huecos o respuesta libre.',
        'Elige formatos compatibles sin repetir: opción múltiple, huecos o respuesta libre. ¿Cuáles prefieres?',
        'Esta solicitud necesita más de 25 bloques. Divídela en solicitudes de un máximo de 25 bloques cada una.',
        'La cantidad no coincide con la lista de palabras o hay duplicados. ¿Conservo todas las palabras distintas o cambio la lista o la cantidad?',
        'El material completo no cabe en una generación. Reduce el vocabulario, acorta el texto de origen o divide la solicitud. No se han omitido palabras ni fragmentos.',
    ],
    fr: [
        'Chaque tâche de grammaire ou de texte bilingue crée un bloc. Demandez chaque bloc supplémentaire dans une tâche distincte.',
        'Les formats concernent seulement les exercices. Demandez des exercices à choix multiple, à trous ou à réponse libre.',
        'Choisissez des formats sans répétition : choix multiple, texte à trous ou réponse libre. Lesquels souhaitez-vous ?',
        'Cette demande nécessite plus de 25 blocs. Divisez-la en demandes de 25 blocs maximum chacune.',
        'Le nombre d’entrées ne correspond pas à la liste ou celle-ci contient des doublons. Conserver tous les mots distincts ou modifier la liste ou le nombre ?',
        'Le contenu complet ne tient pas dans une génération. Réduisez le vocabulaire, raccourcissez le texte source ou divisez la demande. Aucun mot ni passage n’a été omis.',
    ],
    de: [
        'Jede Grammatik- oder zweisprachige Textaufgabe erstellt einen Block. Fordere weitere Blöcke als separate Aufgaben an.',
        'Formatangaben gelten nur für Übungen. Fordere Übungen mit Auswahlantworten, Lückentext oder freier Antwort an.',
        'Wähle unterschiedliche unterstützte Formate: Auswahlantwort, Lückentext oder freie Antwort. Welche möchtest du?',
        'Diese Anfrage benötigt mehr als 25 Blöcke. Teile sie in Anfragen mit jeweils höchstens 25 Blöcken auf.',
        'Die Wortanzahl passt nicht zur Liste oder die Liste enthält Wiederholungen. Alle unterschiedlichen Wörter behalten oder Liste oder Anzahl ändern?',
        'Das vollständige Material passt nicht in eine Generierung. Verwende weniger Wörter, kürze den Ausgangstext oder teile die Anfrage. Es wurden keine Wörter oder Passagen ausgelassen.',
    ],
    ar: [
        'كل مهمة قواعد أو نص ثنائي اللغة تنشئ كتلة واحدة. اطلب كل كتلة إضافية في مهمة منفصلة.',
        'اختيار التنسيق مخصص للتمارين. اطلب تمارين اختيار متعدد أو ملء فراغات أو إجابة حرة.',
        'اختر أنواعًا مدعومة دون تكرار: اختيار متعدد أو ملء فراغات أو إجابة حرة. أيها تفضّل؟',
        'يتطلب الطلب أكثر من 25 كتلة. قسّمه إلى طلبات لا يتجاوز كل منها 25 كتلة.',
        'عدد المفردات لا يطابق القائمة أو توجد كلمات مكررة. هل أحتفظ بكل الكلمات المختلفة أم نعدّل القائمة أو العدد؟',
        'المادة كاملة لا تتسع في عملية توليد واحدة. قلّل المفردات أو اختصر النص الأصلي أو قسّم الطلب. لم تُحذف كلمات أو مقاطع.',
    ],
    he: [
        'כל משימת דקדוק או טקסט דו־לשוני יוצרת בלוק אחד. בקשו כל בלוק נוסף כמשימה נפרדת.',
        'בחירת סוג חלה רק על תרגילים. בקשו תרגילי בחירה, השלמת חסרים או תשובה חופשית.',
        'בחרו סוגים נתמכים ללא חזרות: בחירה מרובה, השלמת חסרים או תשובה חופשית. אילו תרצו?',
        'הבקשה דורשת יותר מ־25 בלוקים. פצלו אותה לבקשות של עד 25 בלוקים כל אחת.',
        'מספר המילים אינו תואם לרשימה או שיש בה כפילויות. לשמור את כל המילים השונות או לשנות את הרשימה או המספר?',
        'החומר המלא לא ייכנס ליצירה אחת. צמצמו את אוצר המילים, קצרו את טקסט המקור או פצלו את הבקשה. לא הושמטו מילים או קטעים.',
    ],
    hi: [
        'व्याकरण या द्विभाषी पाठ का हर कार्य एक ब्लॉक बनाता है। हर अतिरिक्त ब्लॉक के लिए अलग कार्य दें।',
        'प्रारूप केवल अभ्यासों के लिए हैं। बहुविकल्पीय, रिक्त स्थान या मुक्त उत्तर वाले अभ्यास माँगें।',
        'बिना दोहराव समर्थित प्रारूप चुनें: बहुविकल्पीय, रिक्त स्थान या मुक्त उत्तर। कौन से चाहिए?',
        'इस अनुरोध के लिए 25 से अधिक ब्लॉक चाहिए। इसे अधिकतम 25 ब्लॉक वाले छोटे अनुरोधों में बाँटें।',
        'शब्दों की संख्या सूची से मेल नहीं खाती या दोहराव है। सभी अलग शब्द रखें या सूची अथवा संख्या बदलें?',
        'पूरी सामग्री एक बार में तैयार नहीं हो सकती। शब्दों की संख्या घटाएँ, मूल पाठ छोटा करें या अनुरोध बाँटें। कोई शब्द या अंश छोड़ा नहीं गया है।',
    ],
    it: [
        'Ogni attività di grammatica o testo bilingue crea un blocco. Richiedi ogni blocco aggiuntivo come attività separata.',
        'I formati si applicano solo agli esercizi. Richiedi esercizi a scelta multipla, completamento o risposta libera.',
        'Scegli formati supportati senza ripetizioni: scelta multipla, completamento o risposta libera. Quali preferisci?',
        'Questa richiesta richiede più di 25 blocchi. Dividila in richieste di massimo 25 blocchi ciascuna.',
        'Il numero di voci non corrisponde all’elenco o ci sono duplicati. Mantengo tutte le parole distinte o cambiamo elenco o numero?',
        'Il materiale completo non entra in una sola generazione. Riduci il vocabolario, accorcia il testo originale o dividi la richiesta. Nessuna parola o parte è stata omessa.',
    ],
    ja: [
        '文法または対訳文の各タスクは1ブロックを作成します。追加のブロックは別のタスクとして依頼してください。',
        '形式の指定は練習問題にのみ適用されます。選択式、穴埋め、自由記述の練習を依頼してください。',
        '対応する形式を重複なく選んでください：選択式、穴埋め、自由記述。どの形式にしますか？',
        'この依頼には25ブロックを超える内容が必要です。各依頼が25ブロック以下になるように分割してください。',
        '語数と単語リストが一致しないか、重複があります。重複を除いた全単語を使いますか、それともリストや語数を変更しますか？',
        '教材全体を1回では生成できません。語彙項目を減らすか、原文を短くするか、依頼を分割してください。単語や文章は省略していません。',
    ],
    ko: [
        '문법 또는 이중 언어 텍스트 작업은 블록 하나를 만듭니다. 추가 블록은 별도 작업으로 요청하세요.',
        '형식 선택은 연습에만 적용됩니다. 객관식, 빈칸 채우기 또는 자유 응답 연습을 요청하세요.',
        '지원되는 형식을 중복 없이 선택하세요: 객관식, 빈칸 채우기, 자유 응답. 어떤 형식을 원하시나요?',
        '이 요청에는 25개가 넘는 블록이 필요합니다. 각각 25개 이하의 작은 요청으로 나누세요.',
        '어휘 수가 목록과 다르거나 중복 단어가 있습니다. 서로 다른 단어를 모두 유지할까요, 아니면 목록이나 개수를 바꿀까요?',
        '전체 자료를 한 번에 생성할 수 없습니다. 어휘 수를 줄이거나 원문을 짧게 하거나 요청을 나누세요. 단어나 문장을 생략하지 않았습니다.',
    ],
    pl: [
        'Każde zadanie gramatyczne lub tekst dwujęzyczny tworzy jeden blok. Dodatkowe bloki zamów jako osobne zadania.',
        'Formaty dotyczą tylko ćwiczeń. Poproś o ćwiczenia wyboru, z lukami lub z odpowiedzią otwartą.',
        'Wybierz formaty bez powtórzeń: wybór odpowiedzi, luki lub odpowiedź otwarta. Które wybierasz?',
        'Ta prośba wymaga ponad 25 bloków. Podziel ją na mniejsze prośby, każda do 25 bloków.',
        'Liczba haseł nie pasuje do listy lub lista zawiera powtórzenia. Zachować wszystkie różne słowa czy zmienić listę lub liczbę?',
        'Cały materiał nie zmieści się w jednym generowaniu. Zmniejsz liczbę słów, skróć tekst źródłowy lub podziel prośbę. Nie pominięto słów ani fragmentów.',
    ],
    pt: [
        'Cada tarefa de gramática ou texto bilíngue cria um bloco. Peça cada bloco adicional como tarefa separada.',
        'Os formatos se aplicam apenas a exercícios. Peça exercícios de múltipla escolha, lacunas ou resposta livre.',
        'Escolha formatos compatíveis sem repetir: múltipla escolha, lacunas ou resposta livre. Quais prefere?',
        'Este pedido precisa de mais de 25 blocos. Divida-o em pedidos de no máximo 25 blocos cada.',
        'A quantidade não corresponde à lista de palavras ou há repetições. Manter todas as palavras distintas ou mudar a lista ou a quantidade?',
        'O material completo não cabe em uma geração. Reduza o vocabulário, encurte o texto original ou divida o pedido. Nenhuma palavra ou passagem foi omitida.',
    ],
    tr: [
        'Her dil bilgisi veya iki dilli metin görevi bir blok oluşturur. Ek blokları ayrı görevler olarak isteyin.',
        'Biçim seçenekleri yalnızca alıştırmalar içindir. Çoktan seçmeli, boşluk doldurma veya serbest yanıt alıştırmaları isteyin.',
        'Desteklenen farklı biçimleri seçin: çoktan seçmeli, boşluk doldurma veya serbest yanıt. Hangilerini istersiniz?',
        'Bu istek 25’ten fazla blok gerektiriyor. Her biri en fazla 25 blok içeren daha küçük isteklere bölün.',
        'Sözcük sayısı listeyle uyuşmuyor veya tekrarlar var. Tüm farklı sözcükler korunsun mu, yoksa liste veya sayı değişsin mi?',
        'Materyalin tamamı tek üretime sığmaz. Sözcük sayısını azaltın, kaynak metni kısaltın veya isteği bölün. Hiçbir sözcük veya bölüm atlanmadı.',
    ],
    uk: [
        'Одна задача з граматики або двомовного тексту створює один блок. Для кожного додаткового блоку додайте окрему задачу.',
        'Формати задаються лише для вправ. Для вибору відповіді, заповнення пропусків або вільної відповіді додайте задачу з вправами.',
        'Виберіть підтримувані формати без повторів: вибір відповіді, заповнення пропусків або вільна відповідь. Які вам потрібні?',
        'Для цього запиту потрібно більше 25 блоків. Розділіть його на запити, не більше 25 блоків у кожному.',
        'Кількість словникових статей не збігається зі списком або в ньому є повтори. Зберегти всі унікальні слова чи змінити список або кількість?',
        'Увесь матеріал не поміститься в одну генерацію. Зменште кількість словникових статей, скоротіть вихідний текст або розділіть запит. Слова й уривки не були пропущені.',
    ],
    zh: [
        '每项语法或双语文本任务生成一个内容块。请将其他内容块作为单独任务提出。',
        '题型选项仅适用于练习。请提出选择题、填空题或自由作答练习任务。',
        '请选择支持且不重复的题型：选择题、填空题或自由作答。您想使用哪些？',
        '此请求需要超过25个内容块。请拆分为每项不超过25个内容块的小请求。',
        '词数与单词列表不符，或有重复项。保留所有不同的单词，还是修改列表或词数？',
        '完整材料无法在一次生成中容纳。请减少词汇条目、缩短原文或拆分请求。未省略任何单词或段落。',
    ],
};

export function learningContentLimitationCopy(
    language: string,
    code: LearningContentLimitationCode,
): string {
    const baseLanguage = language.toLowerCase().split('-')[0]!;
    if (
        code === 'activity-count-conflict' ||
        code === 'activity-prerequisite' ||
        code === 'task-dependency'
    ) {
        return (
            activityMessages[code][baseLanguage] ?? activityMessages[code].en!
        );
    }

    return (messages[baseLanguage] ?? messages.en!)[messageIndex[code]]!;
}
