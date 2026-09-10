import type { Messages } from './en';

export const es = {
    'theme.label': 'Tema',
    'theme.option.light': 'Claro',
    'theme.option.dark': 'Oscuro',
    'theme.option.system': 'Sistema',
    'language.label': 'Idioma',
    'language.option.en': 'English',
    'language.option.es': 'Español',
    'language.option.fr': 'Français',
    'language.option.ru': 'Русский',
    'toast.notifications': 'Notificaciones',
    'meta.description':
        'Aprendizaje de idiomas con IA para estudiantes y tutores.',
    'meta.notFound': 'Página no encontrada · Languon',
    'meta.forgotPassword': 'Restablecer contraseña · Languon',
    'meta.login': 'Iniciar sesión · Languon',
    'meta.resetPassword': 'Nueva contraseña · Languon',
    'meta.security': 'Seguridad · Languon',
    'meta.signup': 'Crear una cuenta · Languon',
    'meta.verifyEmail': 'Verificar correo · Languon',
    'meta.dictionaries': 'Mis diccionarios · Languon',
    'meta.dictionaryEditor': 'Editor de diccionario · Languon',
    'meta.sharedDictionary': 'Diccionario compartido · Languon',
    'home.eyebrow': 'Aprendizaje de idiomas con IA',
    'home.description':
        'Aprende con cursos personalizados, herramientas prácticas y un tutor que se adapta a tus objetivos y progreso.',
    'home.restoring': 'Restaurando tu cuenta…',
    'home.signedInAs': 'Sesión iniciada como {email}',
    'home.security': 'Configuración de seguridad',
    'home.dictionaries': 'Diccionarios',
    'home.accountNavigation': 'Cuenta',
    'home.getStarted': 'Empezar',
    'home.signIn': 'Iniciar sesión',
    'notFound.eyebrow': 'No encontrada',
    'notFound.title': 'No se encontró esta página',
    'notFound.description':
        'Puede que la dirección sea incorrecta o que la página se haya movido.',
    'notFound.home': 'Volver al inicio',
    'auth.brandHome': 'Inicio de Languon',
    'auth.newToLanguon': '¿Nuevo en Languon?',
    'auth.alreadyAccount': '¿Ya tienes una cuenta?',
    'auth.createAccount': 'Crear una cuenta',
    'auth.signIn': 'Iniciar sesión',
    'auth.capabilitiesChecking': 'Comprobando métodos de acceso disponibles…',
    'auth.capabilitiesUnavailable':
        'Las opciones de acceso no están disponibles temporalmente.',
    'common.retry': 'Reintentar',
    'common.email': 'Correo electrónico',
    'common.password': 'Contraseña',
    'common.newPassword': 'Nueva contraseña',
    'common.currentPassword': 'Contraseña actual',
    'common.show': 'Mostrar',
    'common.hide': 'Ocultar',
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'password.toggleLabel': '{action} {label}',
    'password.hint':
        'Usa entre 15 y 128 caracteres. Se permiten espacios y contraseñas pegadas.',
    'login.eyebrow': 'Tu cuenta',
    'login.title': 'Iniciar sesión',
    'login.intro':
        'Te damos la bienvenida. Tu espacio de aprendizaje está listo.',
    'login.passwordResetComplete':
        'Tu contraseña cambió y se cerraron las sesiones activas. Inicia sesión con la nueva contraseña.',
    'login.invalid': 'Comprueba tus datos de acceso.',
    'login.forgotPassword': '¿Olvidaste la contraseña?',
    'login.pending': 'Iniciando sesión…',
    'login.or': 'o',
    'login.passkeyPending': 'Esperando la llave de acceso…',
    'login.passkey': 'Iniciar sesión con una llave de acceso',
    'passkey.unsupported':
        'Las llaves de acceso necesitan un navegador compatible y un contexto seguro.',
    'signup.eyebrow': 'Únete a Languon',
    'signup.title': 'Crear una cuenta',
    'signup.intro':
        'Crea tu cuenta y después confirma que el correo electrónico te pertenece.',
    'signup.invalid': 'Comprueba los datos de tu cuenta.',
    'signup.unavailable':
        'El registro por correo no está disponible. Si ya tienes una cuenta, intenta iniciar sesión.',
    'signup.pending': 'Creando la cuenta…',
    'signup.submit': 'Crear cuenta',
    'verify.eyebrow': 'Un último paso',
    'verify.title': 'Verifica tu correo electrónico',
    'verify.intro':
        'Introduce el código de cuatro dígitos que enviamos. Caduca en diez minutos.',
    'verify.incomplete': 'El enlace de verificación está incompleto.',
    'verify.incompleteFull':
        'El enlace de verificación está incompleto. Inicia el registro de nuevo.',
    'verify.startAgain': 'Iniciar el registro de nuevo.',
    'verify.invalidCode': 'Introduce el código de cuatro dígitos del correo.',
    'verify.code': 'Código de verificación',
    'verify.checking': 'Comprobando el código…',
    'verify.submit': 'Verificar correo',
    'verify.sending': 'Enviando…',
    'verify.resendIn': 'Enviar otro código en {seconds} s',
    'verify.resend': 'Enviar otro código',
    'verify.resent':
        'Si la dirección puede recibir el correo de verificación, ya se envió un código nuevo.',
    'verify.unavailable':
        'La verificación por correo no está disponible en este entorno.',
    'auth.returnToSignIn': 'Volver al inicio de sesión.',
    'forgot.eyebrow': 'Recuperación de cuenta',
    'forgot.title': 'Restablece tu contraseña',
    'forgot.intro':
        'Enviaremos un código si la dirección puede usar la recuperación de contraseña.',
    'forgot.invalidEmail': 'Introduce un correo electrónico válido.',
    'forgot.unavailable':
        'La recuperación de contraseña no está disponible en este entorno.',
    'forgot.pending': 'Solicitando código…',
    'forgot.submit': 'Enviar código de recuperación',
    'forgot.back': 'Volver al inicio de sesión',
    'reset.eyebrow': 'Recuperación de cuenta',
    'reset.title': 'Elige una contraseña nueva',
    'reset.intro':
        'Introduce el código de recuperación de cuatro dígitos y elige una contraseña nueva.',
    'reset.invalid': 'Comprueba el código y la contraseña nueva.',
    'reset.complete':
        'Tu contraseña cambió y se cerraron las sesiones activas.',
    'reset.signInNew': 'Inicia sesión con la contraseña nueva.',
    'reset.incomplete': 'El enlace de recuperación está incompleto.',
    'reset.requestNew': 'Solicitar un código nuevo.',
    'reset.code': 'Código de recuperación',
    'reset.pending': 'Cambiando contraseña…',
    'reset.submit': 'Cambiar contraseña',
    'security.eyebrow': 'Tu cuenta',
    'security.title': 'Configuración de seguridad',
    'security.restoring': 'Restaurando tu sesión…',
    'security.signInRequired': 'Inicia sesión para gestionar tu seguridad.',
    'security.goToSignIn': 'Ir al inicio de sesión.',
    'security.signInAgain': 'Iniciar sesión de nuevo.',
    'security.account': 'Cuenta',
    'security.sessionExpires': 'La sesión actual caduca',
    'security.changePassword': 'Cambiar contraseña',
    'security.changePasswordHelp':
        'Al cambiar la contraseña se cierran todas las demás sesiones.',
    'security.passwordsInvalid': 'Comprueba ambas contraseñas.',
    'security.passwordChanged':
        'Contraseña cambiada. Se cerraron las demás sesiones.',
    'security.passkeys': 'Llaves de acceso',
    'security.passkeysHelp':
        'Usa una llave del dispositivo para acceder sin contraseña. Añadirla o eliminarla puede requerir otro inicio de sesión.',
    'security.passkeyName': 'Nombre de la llave',
    'security.passkeyPlaceholder': 'Portátil personal',
    'security.passkeyNameInvalid': 'Introduce un nombre para la llave.',
    'security.addPasskey': 'Añadir llave',
    'security.passkeyAdded': 'Llave de acceso añadida.',
    'security.passkeyRenamed': 'Llave de acceso renombrada.',
    'security.passkeyRemoved': 'Llave de acceso eliminada.',
    'security.loadingPasskeys': 'Cargando llaves…',
    'security.retryPasskeys': 'Reintentar la carga de llaves',
    'security.noPasskeys': 'Aún no hay llaves de acceso.',
    'security.sessions': 'Sesiones',
    'security.signOutHere': 'Cerrar sesión aquí',
    'security.signOutEverywhere': 'Cerrar sesión en todas partes',
    'security.added': 'Añadida el {date}',
    'security.lastUsed': 'Último uso: {date}',
    'security.newPasskeyName': 'Nuevo nombre de la llave',
    'security.saveNamed': 'Guardar {name}',
    'security.cancelRenaming': 'Cancelar el cambio de nombre de {name}',
    'security.renameNamed': 'Cambiar el nombre de {name}',
    'security.rename': 'Renombrar',
    'security.removeNamed': 'Eliminar {name}',
    'security.confirmRemoveNamed': 'Confirmar la eliminación de {name}',
    'security.remove': 'Eliminar',
    'security.confirmRemove': 'Confirmar eliminación',
    'security.cancelRemoving': 'Cancelar la eliminación de {name}',
    'dictionary.library.eyebrow': 'Biblioteca de vocabulario',
    'dictionary.library.title': 'Mis diccionarios',
    'dictionary.library.create': 'Nuevo diccionario',
    'dictionary.library.createFirst': 'Crear mi primer diccionario',
    'dictionary.library.search': 'Buscar diccionarios',
    'dictionary.library.lifecycle': 'Estado del diccionario',
    'dictionary.library.loading': 'Cargando diccionarios…',
    'dictionary.library.empty': 'Crea tu primer diccionario',
    'dictionary.library.emptyHelp':
        'Elige un par de idiomas y empieza a crear vocabulario reutilizable.',
    'dictionary.library.noResults':
        'Ningún diccionario coincide con la búsqueda',
    'dictionary.library.noResultsHelp':
        'Prueba otro nombre o borra la búsqueda.',
    'dictionary.library.noArchived': 'No hay diccionarios archivados',
    'dictionary.library.open': 'Abrir diccionario',
    'dictionary.library.archive': 'Archivar',
    'dictionary.library.restore': 'Restaurar',
    'dictionary.library.archivedOutcome':
        'Diccionario archivado. Su enlace público ya no está disponible.',
    'dictionary.library.restoredOutcome':
        'Diccionario restaurado como privado.',
    'dictionary.library.cardCount': '{count} tarjetas activas',
    'dictionary.library.updated': 'Actualizado {date}',
    'dictionary.library.loadMore': 'Cargar más diccionarios',
    'dictionary.library.retryLoadMore': 'Reintentar cargar más diccionarios',
    'dictionary.library.loadMoreFailed':
        'No se pudieron cargar más diccionarios. Los resultados actuales siguen disponibles.',
    'dictionary.lifecycle.active': 'Activo',
    'dictionary.lifecycle.archived': 'Archivado',
    'dictionary.visibility.private': 'Privado',
    'dictionary.visibility.unlisted': 'No listado',
    'dictionary.create.title': 'Crear un diccionario',
    'dictionary.create.description':
        'El diccionario empieza siendo privado. Después puedes compartirlo con un enlace de capacidad.',
    'dictionary.create.submit': 'Crear diccionario',
    'dictionary.dialog.close': 'Cerrar',
    'dictionary.field.name': 'Nombre',
    'dictionary.field.description': 'Descripción',
    'dictionary.field.optional': 'opcional',
    'dictionary.field.sourceLanguage': 'Traducir de',
    'dictionary.field.targetLanguage': 'Traducir a',
    'dictionary.field.source': 'Frase de origen',
    'dictionary.field.translation': 'Traducción',
    'dictionary.field.transcription': 'Transcripción',
    'dictionary.field.definition': 'Definición',
    'dictionary.field.example': 'Ejemplo de contexto',
    'dictionary.field.exampleTranslation': 'Traducción del ejemplo',
    'dictionary.settings.title': 'Ajustes del diccionario',
    'dictionary.settings.optionalFields': 'Campos opcionales de las tarjetas',
    'dictionary.settings.pairLocked':
        'El par de idiomas se bloquea después de la primera tarjeta.',
    'dictionary.settings.notation': 'Notación de transcripción',
    'dictionary.settings.customNotation': 'Etiqueta de notación personalizada',
    'dictionary.settings.definitionLanguage': 'Idioma de la definición',
    'dictionary.settings.exampleLanguage': 'Idioma del ejemplo',
    'dictionary.settings.inactiveHelp':
        'Desactivar un campo conserva los valores existentes, pero inactivos.',
    'dictionary.settings.save': 'Guardar ajustes',
    'dictionary.settings.saved': 'Ajustes del diccionario guardados.',
    'dictionary.settings.cancelled': 'Se cancelaron los ajustes sin guardar.',
    'dictionary.notation.ipa': 'AFI',
    'dictionary.notation.romanization': 'Romanización',
    'dictionary.notation.custom': 'Personalizada',
    'dictionary.role.source': 'Idioma de origen',
    'dictionary.role.target': 'Idioma de destino',
    'dictionary.override.inherit': 'Heredar',
    'dictionary.override.enabled': 'Activado',
    'dictionary.override.disabled': 'Desactivado',
    'dictionary.authorship.human': 'Humano',
    'dictionary.authorship.ai-generated': 'Generado por IA',
    'dictionary.authorship.mixed': 'Humano + IA',
    'dictionary.card.createTitle': 'Añadir tarjeta',
    'dictionary.card.editTitle': 'Editar tarjeta',
    'dictionary.card.advanced': 'Ajustes avanzados',
    'dictionary.card.advancedHelp':
        'Sobrescribe los campos heredados de esta tarjeta. Heredar mantiene el valor del diccionario.',
    'dictionary.card.inactiveValue': '{field} inactivo',
    'dictionary.card.inactiveHelp':
        'Este valor se conserva y volverá si se activa el campo.',
    'dictionary.card.save': 'Guardar tarjeta',
    'dictionary.card.saved': 'Tarjeta guardada.',
    'dictionary.card.savedDuplicate':
        'Tarjeta guardada. Otra tarjeta tiene la misma frase de origen.',
    'dictionary.card.duplicateWarning':
        'Otra tarjeta cargada tiene la misma frase de origen. Se permiten sentidos y contextos distintos; revisa ambas antes de guardar.',
    'dictionary.cards.title': 'Tarjetas ({count})',
    'dictionary.cards.orderHelp':
        'Las tarjetas mantienen este orden al leer y exportar.',
    'dictionary.cards.add': 'Añadir tarjeta',
    'dictionary.cards.search': 'Buscar tarjetas',
    'dictionary.cards.lifecycle': 'Estado de la tarjeta',
    'dictionary.cards.empty': 'No hay tarjetas aquí',
    'dictionary.cards.emptyHelp':
        'Añade una tarjeta o cambia los filtros de búsqueda y estado.',
    'dictionary.cards.edit': 'Editar',
    'dictionary.cards.actions': 'Acciones, tarjeta {position}',
    'dictionary.cards.archive': 'Archivar',
    'dictionary.cards.restore': 'Restaurar',
    'dictionary.cards.moveEarlier': 'Mover antes',
    'dictionary.cards.moveLater': 'Mover después',
    'dictionary.cards.loadMore': 'Cargar más tarjetas',
    'dictionary.cards.loadMoreFailed':
        'No se pudieron cargar más tarjetas. Las tarjetas cargadas siguen disponibles.',
    'dictionary.cards.archivedOutcome': 'Tarjeta archivada.',
    'dictionary.cards.restoredOutcome': 'Tarjeta restaurada.',
    'dictionary.cards.reordered': 'Orden de tarjetas guardado.',
    'dictionary.share.title': 'Compartir',
    'dictionary.share.help':
        'Cualquiera con el enlace completo puede leer un diccionario no listado. Nunca se indexa.',
    'dictionary.share.privateStatus': 'Este diccionario es privado.',
    'dictionary.share.unlistedStatus':
        'Este diccionario no está listado. Archivarlo o revocarlo desactiva su enlace.',
    'dictionary.share.once':
        'Este enlace nuevo se muestra solo ahora. Cópialo antes de salir.',
    'dictionary.share.publish': 'Crear enlace compartido',
    'dictionary.share.rotate': 'Rotar enlace compartido',
    'dictionary.share.copy': 'Copiar enlace',
    'dictionary.share.revoke': 'Revocar acceso público',
    'dictionary.share.rotated':
        'Hay un enlace nuevo. El anterior ya no funciona.',
    'dictionary.share.copied': 'Enlace copiado.',
    'dictionary.share.copyFailed':
        'No se pudo copiar el enlace para compartir.',
    'dictionary.share.revoked': 'Acceso público revocado.',
    'dictionary.public.eyebrow': 'Diccionario no listado · sin indexar',
    'dictionary.public.loading': 'Abriendo diccionario compartido…',
    'dictionary.public.loadMoreFailed':
        'No se pudieron cargar más tarjetas. Las tarjetas cargadas siguen disponibles.',
    'dictionary.public.noIndex': 'No listado · sin indexar',
    'dictionary.public.unavailable': 'Diccionario no disponible',
    'dictionary.public.unavailableHelp':
        'Este enlace puede ser inválido, rotado, revocado o archivado.',
    'dictionary.public.forkTitle': 'Crear una copia independiente',
    'dictionary.public.forkHelp':
        'La copia es privada, tiene identificadores nuevos y no cambia con el original.',
    'dictionary.public.fork': 'Copiar en privado',
    'dictionary.public.signInToFork': 'Inicia sesión para copiar',
    'dictionary.public.forkFailed':
        'No se pudo crear la copia privada. Inténtalo de nuevo.',
    'dictionary.backToLibrary': 'Volver a diccionarios',
    'dictionary.unavailable': 'Diccionario no disponible',
    'dictionary.unavailableHelp':
        'Puede haberse eliminado o quizá no tengas acceso.',
    'dictionary.editor.loading': 'Cargando diccionario…',
    'dictionary.editor.archived': 'Este diccionario está archivado',
    'dictionary.editor.archivedHelp':
        'Restáuralo para editar ajustes, tarjetas y uso compartido.',
    'dictionary.error.title': 'No se pudieron cargar los diccionarios',
    'dictionary.error.generic':
        'Los diccionarios no están disponibles temporalmente. Inténtalo de nuevo.',
    'dictionary.error.capacity':
        'Este diccionario o cuenta alcanzó el límite de contenido conservado.',
    'dictionary.error.conflict':
        'Este diccionario cambió en otro lugar. Recarga antes de volver a guardar.',
    'dictionary.error.signIn': 'Inicia sesión para gestionar tus diccionarios.',
    'dictionary.conflict.title': 'Revisar una versión más reciente',
    'dictionary.conflict.help':
        'Otro cambio se guardó primero. Recarga, revísalo e inténtalo de nuevo.',
    'dictionary.conflict.reload': 'Recargar versión actual',
    'dictionary.authoring.aiSection': 'Sugerencias de IA',
    'dictionary.authoring.generate': 'Generar con IA',
    'dictionary.authoring.generateHelp':
        'La IA propone valores debajo de cada campo. Nada se aplica hasta que lo aceptes.',
    'dictionary.authoring.regenerateAll': 'Regenerar todos los campos',
    'dictionary.authoring.progress': 'Progreso de sugerencias de IA',
    'dictionary.authoring.stage.queued': 'Esperando para generar sugerencias…',
    'dictionary.authoring.stage.generating': 'Generando sugerencias…',
    'dictionary.authoring.stage.validating': 'Comprobando sugerencias…',
    'dictionary.authoring.cancel': 'Cancelar generación',
    'dictionary.authoring.cancelling': 'Cancelando generación…',
    'dictionary.authoring.unavailable':
        'Las sugerencias de IA no están disponibles. Puedes completar la tarjeta manualmente.',
    'dictionary.authoring.stale':
        'La frase de origen cambió. Estas sugerencias son de la frase anterior y no se pueden usar.',
    'dictionary.authoring.suggestions': 'Sugerencias de IA',
    'dictionary.authoring.suggestionsFor': 'Sugerencias de IA para {field}',
    'dictionary.authoring.regenerateField': 'Regenerar campo',
    'dictionary.authoring.regenerateFieldNamed': 'Regenerar {field}',
    'dictionary.authoring.limitReached':
        'Descarta una sugerencia antes de generar otra.',
    'dictionary.authoring.accept': 'Aceptar',
    'dictionary.authoring.accepted': 'Aceptada',
    'dictionary.authoring.acceptNamed': 'Aceptar sugerencia de {field}',
    'dictionary.authoring.discard': 'Descartar',
    'dictionary.authoring.discardNamed': 'Descartar sugerencia de {field}',
    'dictionary.authoring.failed':
        'No se pudieron generar sugerencias. Tus datos y sugerencias anteriores no cambiaron.',
    'dictionary.batch.open': 'Generar tarjetas desde términos pegados',
    'dictionary.batch.title': 'Generar tarjetas desde términos pegados',
    'dictionary.batch.sheetHelp':
        'Pega hasta 100 términos, revisa cada tarjeta y añade juntas las seleccionadas.',
    'dictionary.batch.eyebrow': 'Generación por lotes con IA',
    'dictionary.batch.inputTitle': 'Pega términos para generar',
    'dictionary.batch.inputHelp':
        'Pon un término o frase en cada línea. Las líneas vacías se ignoran.',
    'dictionary.batch.terms': 'Términos o frases',
    'dictionary.batch.termsHelp': 'Un término de origen por línea, hasta 100.',
    'dictionary.batch.context': 'Contexto',
    'dictionary.batch.contextHelp':
        'Añade una instrucción acotada que se aplique a todo el lote.',
    'dictionary.batch.optional': 'Opcional',
    'dictionary.batch.generate': 'Generar tarjetas',
    'dictionary.batch.loading': 'Cargando la generación por lotes…',
    'dictionary.batch.loadFailed': 'No se pudo cargar la generación por lotes',
    'dictionary.batch.persistenceHelp':
        'Puedes salir de la página. El progreso y la cancelación persisten al navegar o recargar.',
    'dictionary.batch.progressLabel': 'Progreso de generación por lotes',
    'dictionary.batch.reviewTitle': 'Revisar tarjetas generadas',
    'dictionary.batch.reviewHelp':
        '{count} seleccionadas. Edita, elimina o excluye filas antes de añadirlas.',
    'dictionary.batch.selectedCount': '{count} seleccionadas',
    'dictionary.batch.includeRow': 'Incluir fila {position}',
    'dictionary.batch.removeRow': 'Eliminar fila',
    'dictionary.batch.inputTerm': 'Término pegado:',
    'dictionary.batch.feedback': 'Notas de generación',
    'dictionary.batch.noCandidates': 'No quedan tarjetas en esta revisión.',
    'dictionary.batch.failuresTitle': 'Términos que requieren atención',
    'dictionary.batch.retryRow': 'Reintentar fila {position}',
    'dictionary.batch.retrySelected': 'Reintentar fallos seleccionados',
    'dictionary.batch.discard': 'Descartar lote',
    'dictionary.batch.commit': 'Añadir {count} tarjetas',
    'dictionary.batch.close': 'Cerrar generación por lotes',
    'dictionary.batch.conflictTitle': 'El diccionario cambió',
    'dictionary.batch.conflictHelp':
        'Recarga las versiones actuales. Tus ediciones y selecciones se conservan.',
    'dictionary.batch.reloadVersions': 'Recargar versiones actuales',
    'dictionary.batch.saved': 'Se añadieron {count} tarjetas generadas.',
    'dictionary.batch.state.accepted':
        'Las tarjetas seleccionadas se añadieron juntas.',
    'dictionary.batch.state.discarded': 'La propuesta del lote se descartó.',
    'dictionary.batch.state.cancelled': 'La generación por lotes se canceló.',
    'dictionary.batch.state.expired':
        'La propuesta caducó. Inicia una nueva generación.',
    'dictionary.batch.state.failed':
        'La generación por lotes no pudo terminar.',
    'dictionary.batch.error.unavailable':
        'La generación por lotes con IA no está disponible ahora.',
    'dictionary.generation.eyebrow': 'Revisión de tarjeta con IA',
    'dictionary.generation.title': 'Revisar tarjeta generada',
    'dictionary.generation.loading': 'Cargando la revisión de generación…',
    'dictionary.generation.loadFailed': 'No se pudo cargar la revisión',
    'dictionary.generation.capabilityFailed':
        'No se pudo comprobar la disponibilidad de la regeneración con IA.',
    'dictionary.generation.close': 'Cerrar revisión',
    'dictionary.generation.instruction': 'Instrucción personalizada',
    'dictionary.generation.instructionHelp':
        'Describe una corrección concreta o el contexto para esta tarjeta. La tarjeta original no cambia hasta que aceptes.',
    'dictionary.generation.start': 'Regenerar con IA',
    'dictionary.generation.openReview': 'Abrir revisión de IA',
    'dictionary.generation.startNew': 'Iniciar una nueva generación',
    'dictionary.generation.persistenceHelp':
        'Puedes salir de esta página. El progreso y la cancelación sobreviven a la navegación y la recarga.',
    'dictionary.generation.progressLabel':
        'Progreso de generación de la tarjeta',
    'dictionary.generation.stage.queued': 'Esperando para comenzar',
    'dictionary.generation.stage.awaiting_upload': 'Esperando la subida',
    'dictionary.generation.stage.scanning': 'Analizando el documento',
    'dictionary.generation.stage.extracting': 'Extrayendo términos',
    'dictionary.generation.stage.ocr': 'Leyendo páginas escaneadas',
    'dictionary.generation.stage.cleaning': 'Eliminando el documento original',
    'dictionary.generation.stage.generating': 'Generando una propuesta',
    'dictionary.generation.stage.validating': 'Validando la propuesta',
    'dictionary.generation.stage.review_ready': 'Propuesta lista para revisar',
    'dictionary.generation.stage.terminal': 'Generación finalizada',
    'dictionary.generation.cancel': 'Cancelar generación',
    'dictionary.generation.cancelling': 'Cancelando generación…',
    'dictionary.generation.original': 'Tarjeta original',
    'dictionary.generation.current': 'Tarjeta actual después de recargar',
    'dictionary.generation.proposal': 'Tarjeta propuesta',
    'dictionary.generation.editable': 'Propuesta editable',
    'dictionary.generation.version': 'Versión original {version}',
    'dictionary.generation.currentVersion': 'Versión actual {version}',
    'dictionary.generation.notProvided': 'Sin contenido',
    'dictionary.generation.changed': 'Cambiado',
    'dictionary.generation.unchanged': 'Sin cambios',
    'dictionary.generation.reason': 'Motivo:',
    'dictionary.generation.alternatives': 'Alternativas',
    'dictionary.generation.warnings': 'Revisa estas advertencias',
    'dictionary.generation.discard': 'Descartar propuesta',
    'dictionary.generation.regenerate': 'Regenerar propuesta',
    'dictionary.generation.accept': 'Aceptar tarjeta revisada',
    'dictionary.generation.retry': 'Reintentar generación',
    'dictionary.generation.conflictTitle':
        'La tarjeta cambió desde la generación',
    'dictionary.generation.conflictHelp':
        'Vuelve a cargar la tarjeta actual y compárala con esta propuesta. La propuesta no se repetirá automáticamente.',
    'dictionary.generation.reloadCompare': 'Recargar y comparar',
    'dictionary.generation.state.accepted':
        'La propuesta revisada fue aceptada.',
    'dictionary.generation.state.discarded': 'La propuesta fue descartada.',
    'dictionary.generation.state.cancelled': 'La generación fue cancelada.',
    'dictionary.generation.state.expired':
        'Esta propuesta caducó. Inicia una nueva generación para continuar.',
    'dictionary.generation.state.failed': 'La generación no pudo finalizar.',
    'dictionary.generation.error.unavailable':
        'La regeneración con IA no está disponible ahora.',
    'dictionary.generation.error.notFound':
        'Este trabajo de generación ya no está disponible.',
    'dictionary.generation.error.notReviewable':
        'Esta propuesta ya no se puede revisar.',
    'dictionary.generation.error.expired':
        'Esta propuesta caducó. Inicia una nueva generación.',
    'dictionary.generation.error.candidateConflict':
        'La propuesta enviada difiere de la propuesta ya aceptada.',
    'dictionary.document.open': 'Generar tarjetas desde un documento',
    'dictionary.document.title': 'Generar tarjetas desde un documento',
    'dictionary.document.sheetHelp':
        'Sube una lista explícita de términos y revisa las tarjetas antes de guardarlas.',
    'dictionary.document.eyebrow': 'Generación desde documento',
    'dictionary.document.inputTitle': 'Elige un documento con términos',
    'dictionary.document.inputHelp':
        'Usa TXT, Markdown, DOCX, PDF, PNG, JPEG o WebP, hasta 20 MiB y 100 páginas.',
    'dictionary.document.file': 'Documento',
    'dictionary.document.fileHelp':
        'Cada línea, elemento, párrafo o celda debe contener un término de origen.',
    'dictionary.document.instruction': 'Instrucción de generación',
    'dictionary.document.instructionHelp':
        'Opcionalmente aclara el tema o estilo de traducción.',
    'dictionary.document.optional': 'Opcional',
    'dictionary.document.start': 'Subir y generar tarjetas',
    'dictionary.document.nativeAvailable':
        'La extracción de texto nativo está disponible.',
    'dictionary.document.nativeUnavailable':
        'La extracción de texto nativo no está disponible.',
    'dictionary.document.ocrAvailable':
        'Las páginas escaneadas pueden usar OCR.',
    'dictionary.document.ocrUnavailable':
        'El OCR no está disponible; no se pueden procesar imágenes escaneadas.',
    'dictionary.document.unavailable':
        'La generación desde documentos no está disponible.',
    'dictionary.document.loading': 'Cargando la generación desde documento…',
    'dictionary.document.loadFailed':
        'No se pudo cargar la generación desde documento',
    'dictionary.document.persistenceHelp':
        'Puedes salir y volver a esta URL mientras se procesa.',
    'dictionary.document.progressLabel':
        'Progreso de generación desde documento',
    'dictionary.document.stage.awaiting_upload': 'Esperando la subida privada',
    'dictionary.document.stage.queued': 'Esperando el análisis del documento',
    'dictionary.document.stage.scanning': 'Analizando el documento',
    'dictionary.document.stage.extracting': 'Extrayendo términos explícitos',
    'dictionary.document.stage.ocr': 'Leyendo páginas escaneadas con OCR',
    'dictionary.document.stage.generating': 'Generando propuestas de tarjetas',
    'dictionary.document.stage.validating': 'Validando propuestas',
    'dictionary.document.stage.cleaning': 'Eliminando el documento original',
    'dictionary.document.stage.review_ready': 'Tarjetas listas para revisar',
    'dictionary.document.stage.terminal': 'Generación finalizada',
    'dictionary.document.cancel': 'Cancelar procesamiento',
    'dictionary.document.cancelling': 'Cancelando…',
    'dictionary.document.reviewTitle': 'Revisa las tarjetas generadas',
    'dictionary.document.reviewHelp':
        'Edita, excluye o elimina tarjetas. Solo las seleccionadas se guardan juntas.',
    'dictionary.document.selectedCount': '{count} seleccionadas',
    'dictionary.document.includeRow': 'Incluir término extraído {position}',
    'dictionary.document.removeRow': 'Eliminar tarjeta',
    'dictionary.document.extractedTerm': 'Término extraído:',
    'dictionary.document.feedback': 'Notas de generación',
    'dictionary.document.failuresTitle':
        'Términos extraídos que requieren atención',
    'dictionary.document.retryRow': 'Reintentar término extraído {position}',
    'dictionary.document.retrySelected': 'Reintentar los fallos seleccionados',
    'dictionary.document.discard': 'Descartar revisión',
    'dictionary.document.commit': 'Añadir {count} tarjetas',
    'dictionary.document.close': 'Cerrar generación desde documento',
    'dictionary.document.conflictTitle': 'El diccionario cambió',
    'dictionary.document.conflictHelp':
        'Recarga las versiones actuales. No se guardó ninguna tarjeta.',
    'dictionary.document.reloadVersions': 'Recargar versiones actuales',
    'dictionary.document.saved': 'Se añadieron {count} tarjetas del documento.',
    'dictionary.document.state.accepted':
        'Se añadieron las tarjetas seleccionadas.',
    'dictionary.document.state.discarded':
        'Se descartó la propuesta del documento.',
    'dictionary.document.state.cancelled': 'Se canceló el procesamiento.',
    'dictionary.document.state.expired':
        'La revisión caducó. Sube el documento de nuevo.',
    'dictionary.document.state.failed': 'No se pudo terminar el procesamiento.',
    'dictionary.document.invalidFile': 'Elige un tipo de documento compatible.',
    'dictionary.document.invalidFileSize':
        'Elige un documento no vacío de hasta 20 MiB.',
    'dictionary.interchange.openImport': 'Importar tarjetas',
    'dictionary.interchange.openExport': 'Exportar',
    'dictionary.interchange.fileTooLarge': 'Elige un archivo de hasta 1 MiB.',
    'dictionary.interchange.fileInvalidUtf8':
        'Elige un archivo de texto UTF-8 válido.',
    'dictionary.interchange.importEyebrow': 'Transferencia de Quizlet',
    'dictionary.interchange.importTitle': 'Previsualizar e importar tarjetas',
    'dictionary.interchange.importHelp':
        'Pega texto de Quizlet o elige un archivo CSV o TSV. El servidor vuelve a validar el contenido original al importar.',
    'dictionary.interchange.file': 'Archivo CSV, TSV o de texto',
    'dictionary.interchange.content': 'Texto para importar',
    'dictionary.interchange.contentHelp':
        'Usa una fila por tarjeta y elige las columnas de origen y traducción.',
    'dictionary.interchange.delimiter': 'Separador de columnas',
    'dictionary.interchange.tab': 'Tabulación',
    'dictionary.interchange.comma': 'Coma',
    'dictionary.interchange.header':
        'La primera fila contiene nombres de columnas',
    'dictionary.interchange.sourceColumn': 'Columna de origen',
    'dictionary.interchange.targetColumn': 'Columna de traducción',
    'dictionary.interchange.column': 'Columna {position}',
    'dictionary.interchange.preview': 'Previsualizar importación',
    'dictionary.interchange.previewTitle': 'Vista previa de importación',
    'dictionary.interchange.summary':
        '{ready} listas, {failures} requieren atención, {total} en total',
    'dictionary.interchange.sampleNotice':
        'Esta es una muestra de la importación. La importación determinista añade todas las filas válidas; edita el texto original o la asignación y vuelve a previsualizar para cambiar la importación completa.',
    'dictionary.interchange.duplicateSummary':
        '{count} filas de origen duplicadas se importarán con avisos.',
    'dictionary.interchange.capacityWarning':
        'Este diccionario admite {count} filas más. Reduce la importación antes de continuar.',
    'dictionary.interchange.includeRow': 'Enriquecer fila {position}',
    'dictionary.interchange.failures': 'Filas que requieren atención',
    'dictionary.interchange.failureRow': 'Fila {position}: {message}',
    'dictionary.interchange.enrich': 'Enriquecer pares seleccionados con IA',
    'dictionary.interchange.aiUnavailable':
        'El enriquecimiento con IA no está disponible. La importación determinista sí.',
    'dictionary.interchange.aiNoOptionalFields':
        'Activa un campo opcional antes de usar el enriquecimiento con IA.',
    'dictionary.interchange.aiLimit':
        'La IA puede usar hasta 100 pares de esta vista previa; la importación determinista sigue añadiendo todas las filas válidas.',
    'dictionary.interchange.instruction':
        'Instrucción opcional de enriquecimiento',
    'dictionary.interchange.generateSelected':
        'Generar {count} revisiones de tarjetas',
    'dictionary.interchange.importReady': 'Importar {count} tarjetas',
    'dictionary.interchange.imported': 'Se importaron {count} tarjetas.',
    'dictionary.interchange.copied': 'Texto de Quizlet copiado.',
    'dictionary.interchange.downloaded':
        'Exportación del diccionario guardada.',
    'dictionary.interchange.exportStreamingRequired':
        'Esta exportación supera los 32 MiB. Usa un navegador compatible con descargas de archivos en streaming.',
    'dictionary.interchange.exportEyebrow': 'Exportación del diccionario',
    'dictionary.interchange.exportTypeDescription':
        'Exportación del diccionario',
    'dictionary.interchange.exportTitle': 'Exportar tarjetas activas',
    'dictionary.interchange.exportHelp':
        'Elige pares básicos compatibles con Quizlet o un CSV completo de Languon.',
    'dictionary.interchange.copyQuizlet': 'Copiar texto para Quizlet',
    'dictionary.interchange.quizletTextHelp':
        'Copia solo origen y traducción. Normaliza tabulaciones y saltos de línea.',
    'dictionary.interchange.downloadQuizletCsv': 'Descargar CSV de Quizlet',
    'dictionary.interchange.quizletCsvHelp':
        'Descarga columnas de origen y traducción seguras para hojas de cálculo.',
    'dictionary.interchange.downloadLanguonCsv':
        'Descargar CSV completo de Languon',
    'dictionary.interchange.languonCsvHelp':
        'Conserva idiomas, campos opcionales, ajustes, orden y autoría.',
    'error.invalid_request': 'Comprueba la información introducida.',
    'error.invalid_credentials': 'El correo o la contraseña no son correctos.',
    'error.email_verification_required': 'Verifica tu correo para continuar.',
    'error.verification_failed': 'El código no es válido o ha caducado.',
    'error.password_policy_failed': 'La contraseña no cumple los requisitos.',
    'error.authentication_required': 'Inicia sesión para continuar.',
    'error.forbidden': 'No tienes permiso para realizar esta acción.',
    'error.recent_authentication_required':
        'Inicia sesión de nuevo para continuar.',
    'error.not_found': 'No se encontró el elemento solicitado.',
    'error.conflict':
        'El cambio entra en conflicto con el estado de la cuenta.',
    'error.rate_limited':
        'Demasiados intentos. Prueba de nuevo en {seconds} segundos.',
    'error.capability_unavailable': 'Ese método de acceso no está disponible.',
    'error.service_unavailable':
        'La autenticación no está disponible temporalmente. Inténtalo de nuevo.',
    'error.passkey_verification_failed':
        'No se pudo verificar la llave de acceso.',
    'error.internal_error': 'Algo salió mal. Inténtalo de nuevo.',
    'error.passkeyCancelled':
        'La solicitud de la llave se canceló o agotó el tiempo.',
    'error.passkeyUnavailable':
        'Esa llave ya está registrada o no está disponible.',
    'error.generic': 'Algo salió mal. Inténtalo de nuevo.',
} satisfies Messages;
