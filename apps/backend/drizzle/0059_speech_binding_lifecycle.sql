-- Saved-content changes invalidate playback associations; retained global audio is unaffected.
CREATE OR REPLACE FUNCTION invalidate_speech_content_bindings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'dictionary_cards' THEN
    DELETE FROM speech_bindings WHERE card_id = NEW.id;
  ELSIF TG_TABLE_NAME = 'dictionary_settings' THEN
    DELETE FROM speech_bindings WHERE dictionary_id = NEW.dictionary_id;
  ELSE
    DELETE FROM speech_bindings WHERE dictionary_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER speech_card_binding_invalidation AFTER UPDATE ON dictionary_cards
FOR EACH ROW WHEN (OLD.version IS DISTINCT FROM NEW.version) EXECUTE FUNCTION invalidate_speech_content_bindings();
--> statement-breakpoint
CREATE TRIGGER speech_settings_binding_invalidation AFTER UPDATE ON dictionary_settings
FOR EACH ROW WHEN (OLD.version IS DISTINCT FROM NEW.version) EXECUTE FUNCTION invalidate_speech_content_bindings();
--> statement-breakpoint
CREATE TRIGGER speech_dictionary_binding_invalidation AFTER UPDATE ON dictionaries
FOR EACH ROW WHEN (OLD.version IS DISTINCT FROM NEW.version) EXECUTE FUNCTION invalidate_speech_content_bindings();
