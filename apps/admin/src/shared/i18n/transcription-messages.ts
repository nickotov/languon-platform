export const transcriptionMessages = {
    'transcription.nativePriceSourceUrl': 'Price source URL (HTTPS)',
    'transcription.audioDurationMeter': 'Audio duration (native rules only)',
    'transcription.nativeRules': 'Reviewed native pricing rules (JSON)',
    'transcription.nativeRulesHelp':
        'Enter reviewed native pricing rules using audioInputMilliseconds. Rates, minimum billing and rounding are not inferred or prefilled.',
    'transcription.nativeRulesInvalid':
        'Enter valid reviewed native pricing rules. No defaults are supplied.',

    'transcription.required': 'Enter a value.',
    'transcription.invalid':
        'Review the fields. Enabling requires an explicit tariff, reviewed provider price and billing evidence.',
    'transcription.reasonHelp': 'Enter a reason between 5 and 500 characters.',
    'transcription.noConfiguration': 'No configuration has been published.',
    'transcription.on': 'Enabled',
    'transcription.off': 'Disabled',
    'transcription.signIn': 'Sign in again',
    'transcription.title': 'Audio transcription',
    'transcription.description':
        'Prepare a separate OpenAI gpt-transcribe configuration. Engineering review covers direct audio transcription without the Files API; the published endpoint policy lists no training use unless the organization opts in and no abuse-monitoring or application-state retention, subject to provider terms. The global endpoint promises no region or account ZDR entitlement. Actual organization settings and billing need separate review. Publishing a disabled configuration makes no provider calls.',
    'transcription.model': 'Provider/model: OpenAI · gpt-transcribe',
    'transcription.enabled': 'Enable transcription for new requests',
    'transcription.providerPrice': 'Reviewed provider price revision',
    'transcription.selectPrice':
        'Select a published native audio-duration price',
    'transcription.credits': 'Customer credits per minute of source audio',
    'transcription.creditsHelp':
        'Enter the reviewed customer tariff explicitly, with up to three decimal places. No automatic USD conversion applies.',
    'transcription.maximumDuration': 'Maximum audio duration (milliseconds)',
    'transcription.maximumBytes': 'Maximum upload size (bytes)',
    'transcription.maximumCost':
        'Maximum provider expense per action (USD micros)',
    'transcription.billingVerified':
        'I reviewed the exact provider billing rules and finite expense bound',
    'transcription.billingEvidence':
        'Billing rules evidence or reviewed contract reference',
    'transcription.billingHelp':
        'The published per-minute rate alone does not establish minimum billing or rounding. Leave verification off until these rules are supported by evidence.',
    'transcription.reason': 'Reason for this configuration change',
    'transcription.preview': 'Review configuration',
    'transcription.publish': 'Publish reviewed configuration',
    'transcription.reviewTitle': 'Review before publishing',
    'transcription.reviewHelp':
        'This preview is bound to this owner session and exact values for five minutes. Changes require another review.',
    'transcription.ready': 'Ready for publication',
    'transcription.notReady': 'Activation prerequisites are missing',
    'transcription.disabled': 'Disabled',
    'transcription.credentials_missing':
        'Provider credentials are not configured',
    'transcription.execution_unavailable':
        'The transcription execution capability is unavailable',
    'transcription.provider_price_missing':
        'No published provider price is selected',
    'transcription.provider_price_invalid':
        'Select the current OpenAI native duration price',
    'transcription.billing_unverified':
        'Billing rules and supporting evidence have not been reviewed',
    'transcription.processing_controls_unapproved':
        'Select the current engineering-reviewed transcription route revision. This is not legal, provider, ZDR or residency approval.',
    'transcription.dataSharingDisabled':
        'I verified data sharing for training is disabled for the configured OpenAI organization/project',
    'transcription.dataSharingHelp':
        'This attests only the actual organization/project settings for the current configured credential. It expires after 30 days and key rotation requires a new review. It does not approve the technical processing policy. Do not enter API keys or other secrets.',
    'transcription.dataSharingEvidence':
        'Organization/project data-sharing review evidence',
    'transcription.data_sharing_unverified':
        'Verify the actual organization/project has not opted into sharing data for training and record review evidence.',
    'transcription.data_sharing_attestation_expired':
        'Organization/project data-sharing review expired or is missing. Review it again.',
    'transcription.processing_credentials_changed':
        'Current credentials do not match the organization/project attestation. Review the configured organization/project again.',
    'transcription.tariff_missing': 'An explicit customer tariff is required',
    'transcription.provider_bound_unavailable':
        'A finite provider expense bound could not be established',
    'transcription.provider_budget_exceeded':
        'The configured provider budget is below the calculated bound',
    'transcription.retry': 'Reload configuration',
    'transcription.error':
        'The configuration could not be loaded or published. Reload and review it again; sign in again if recent authentication is required.',
    'transcription.published':
        'The immutable configuration revision was published.',
    'transcription.currentRevision': 'Current revision',
    'transcription.before': 'Before',
    'transcription.after': 'Proposed',
} as const;
