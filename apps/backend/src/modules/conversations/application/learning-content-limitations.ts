import type { LearningContentLimitationCode } from './learning-content-contract';

const messageIndex: Record<LearningContentLimitationCode, number> = {
    'single-block-task': 0,
    'exercise-format-only': 1,
    'unsupported-exercise-format': 2,
    'block-limit': 3,
    'word-count-conflict': 4,
    'output-capacity': 5,
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
    return (messages[language] ?? messages.en!)[messageIndex[code]]!;
}
