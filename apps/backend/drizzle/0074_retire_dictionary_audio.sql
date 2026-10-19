-- Preproduction retirement: stop if old inventory still identifies objects or
-- provider work. Reconcile that inventory explicitly before retrying migration.
LOCK TABLE "dictionary_audio_assets", "dictionary_audio_bindings", "dictionary_audio_jobs" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM dictionary_audio_assets)
        OR EXISTS (SELECT 1 FROM dictionary_audio_bindings)
        OR EXISTS (SELECT 1 FROM dictionary_audio_jobs) THEN
        RAISE EXCEPTION 'Obsolete dictionary audio inventory must be reconciled before retirement';
    END IF;
END $$;
--> statement-breakpoint
DROP TABLE "dictionary_audio_assets" CASCADE;--> statement-breakpoint
DROP TABLE "dictionary_audio_bindings" CASCADE;--> statement-breakpoint
DROP TABLE "dictionary_audio_jobs" CASCADE;