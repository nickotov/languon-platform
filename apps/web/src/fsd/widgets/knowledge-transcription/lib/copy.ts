import type { Locale } from '@/fsd/shared/i18n';
export const transcriptionCopy = {
    en: {
        localApply: 'Apply transcript to audio draft',
        localApplied:
            'Transcript added to this audio draft. Apply the block, then Save to publish.',
        localNoSave:
            'Applying changes only this open audio draft. Apply the block and Save the note to publish.',
        title: 'Transcribe uploaded audio',
        source: 'Audio block',
        language: 'Transcript language',
        prepare: 'Prepare transcription',
        confirm: 'Confirm maximum credits',
        maximum: 'Maximum credits',
        quote: 'Review this maximum before confirming. Changes to pricing or configuration require another review.',
        busy: 'Preparing transcription…',
        cancel: 'Cancel request',
        cancelled: 'The transcription request was cancelled.',
        retry: 'Retry this request',
        preview: 'Transcript preview',
        apply: 'Apply transcript to working draft',
        applied: 'Transcript applied to the working draft. Save to publish.',
        conflict:
            'The audio block changed. Your transcript preview is retained; review the current document before applying.',
        failed: 'Transcription could not be completed. Retry this request or cancel it.',
        unready:
            'Transcription is unavailable with the current provider, pricing or credit configuration.',
        empty: 'Add an uploaded WAV or MP3 audio block first.',
        noSave: 'Applying changes only your working draft. This does not save or publish the note.',
    },
    ru: {
        localApply: 'Применить к черновику аудио',
        localApplied:
            'Расшифровка добавлена в черновик аудио. Примените блок и сохраните заметку для публикации.',
        localNoSave:
            'Изменится только открытый черновик аудио. Для публикации примените блок и сохраните заметку.',
        title: 'Расшифровать загруженное аудио',
        source: 'Аудиоблок',
        language: 'Язык расшифровки',
        prepare: 'Подготовить расшифровку',
        confirm: 'Подтвердить максимум кредитов',
        maximum: 'Максимум кредитов',
        quote: 'Проверьте максимум перед подтверждением. При изменении цены или настроек потребуется новая проверка.',
        busy: 'Подготовка расшифровки…',
        cancel: 'Отменить запрос',
        cancelled: 'Запрос на расшифровку отменён.',
        retry: 'Повторить этот запрос',
        preview: 'Предпросмотр расшифровки',
        apply: 'Применить расшифровку к черновику',
        applied: 'Расшифровка применена к черновику. Сохраните для публикации.',
        conflict:
            'Аудиоблок изменился. Предпросмотр сохранён; проверьте документ перед применением.',
        failed: 'Не удалось завершить расшифровку. Повторите этот запрос или отмените его.',
        unready:
            'Расшифровка недоступна с текущими настройками провайдера, цены или кредитов.',
        empty: 'Сначала добавьте аудиоблок с загруженным WAV или MP3.',
        noSave: 'Применение изменяет только рабочий черновик. Заметка не сохраняется и не публикуется.',
    },
    es: {
        localApply: 'Aplicar al borrador de audio',
        localApplied:
            'Transcripción añadida al borrador de audio. Aplica el bloque y guarda para publicar.',
        localNoSave:
            'Solo cambia este borrador de audio. Aplica el bloque y guarda la nota para publicar.',
        title: 'Transcribir audio subido',
        source: 'Bloque de audio',
        language: 'Idioma de la transcripción',
        prepare: 'Preparar transcripción',
        confirm: 'Confirmar créditos máximos',
        maximum: 'Créditos máximos',
        quote: 'Revisa este máximo antes de confirmar. Los cambios de precio o configuración requieren otra revisión.',
        busy: 'Preparando transcripción…',
        cancel: 'Cancelar solicitud',
        cancelled: 'La solicitud de transcripción se canceló.',
        retry: 'Reintentar esta solicitud',
        preview: 'Vista previa de la transcripción',
        apply: 'Aplicar transcripción al borrador',
        applied: 'Transcripción aplicada al borrador. Guarda para publicar.',
        conflict:
            'El bloque de audio ha cambiado. Se conserva la vista previa; revisa el documento antes de aplicarla.',
        failed: 'No se pudo completar la transcripción. Reintenta esta solicitud o cancélala.',
        unready:
            'La transcripción no está disponible con la configuración actual del proveedor, precios o créditos.',
        empty: 'Añade primero un bloque con audio WAV o MP3 subido.',
        noSave: 'Aplicar solo cambia el borrador. No guarda ni publica la nota.',
    },
    fr: {
        localApply: 'Appliquer au brouillon audio',
        localApplied:
            'Transcription ajoutée au brouillon audio. Appliquez le bloc puis enregistrez pour publier.',
        localNoSave:
            'Seul ce brouillon audio change. Appliquez le bloc et enregistrez la note pour publier.',
        title: 'Transcrire un audio importé',
        source: 'Bloc audio',
        language: 'Langue de transcription',
        prepare: 'Préparer la transcription',
        confirm: 'Confirmer le maximum de crédits',
        maximum: 'Crédits maximum',
        quote: 'Vérifiez ce maximum avant de confirmer. Un changement de prix ou de configuration nécessite un nouvel examen.',
        busy: 'Préparation de la transcription…',
        cancel: 'Annuler la demande',
        cancelled: 'La demande de transcription a été annulée.',
        retry: 'Réessayer cette demande',
        preview: 'Aperçu de la transcription',
        apply: 'Appliquer la transcription au brouillon',
        applied:
            'Transcription appliquée au brouillon. Enregistrez pour publier.',
        conflict:
            'Le bloc audio a changé. Votre aperçu est conservé ; vérifiez le document avant de l’appliquer.',
        failed: 'La transcription n’a pas abouti. Réessayez cette demande ou annulez-la.',
        unready:
            'La transcription est indisponible avec la configuration actuelle du fournisseur, des prix ou des crédits.',
        empty: 'Ajoutez d’abord un bloc audio WAV ou MP3 importé.',
        noSave: 'Appliquer ne modifie que le brouillon. Cela n’enregistre ni ne publie la note.',
    },
} satisfies Record<Locale, Record<string, string>>;
