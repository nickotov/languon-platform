ALTER TABLE "dictionary_generation_proposals" DROP CONSTRAINT "dictionary_generation_proposals_payload_state";--> statement-breakpoint
ALTER TABLE "dictionary_generation_proposals" ADD COLUMN "accepted_card_id" uuid;--> statement-breakpoint
ALTER TABLE "dictionary_generation_proposals" ADD COLUMN "accepted_duplicate_source" boolean;--> statement-breakpoint
ALTER TABLE "dictionary_generation_proposals" ADD CONSTRAINT "dictionary_generation_proposals_accepted_card_id_dictionary_cards_id_fk" FOREIGN KEY ("accepted_card_id") REFERENCES "public"."dictionary_cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_generation_proposals" ADD CONSTRAINT "dictionary_generation_proposals_payload_state" CHECK (("dictionary_generation_proposals"."review_state" = 'reviewable' and "dictionary_generation_proposals"."payload" is not null and "dictionary_generation_proposals"."terminal_at" is null and "dictionary_generation_proposals"."accepted_candidate_fingerprint" is null and "dictionary_generation_proposals"."accepted_card_id" is null and "dictionary_generation_proposals"."accepted_card_version" is null and "dictionary_generation_proposals"."accepted_dictionary_version" is null and "dictionary_generation_proposals"."accepted_duplicate_source" is null and "dictionary_generation_proposals"."accepted_revision_id" is null and "dictionary_generation_proposals"."accepted_batch_outcome" is null) or ("dictionary_generation_proposals"."review_state" = 'accepted' and "dictionary_generation_proposals"."payload" is null and "dictionary_generation_proposals"."terminal_at" is not null and ((
                "dictionary_generation_proposals"."accepted_candidate_fingerprint" is not null and
                "dictionary_generation_proposals"."accepted_card_id" is null and
                "dictionary_generation_proposals"."accepted_card_version" is not null and
                "dictionary_generation_proposals"."accepted_dictionary_version" is not null and
                "dictionary_generation_proposals"."accepted_duplicate_source" is null and
                "dictionary_generation_proposals"."accepted_revision_id" is not null and
                "dictionary_generation_proposals"."accepted_batch_outcome" is null
            ) or (
                "dictionary_generation_proposals"."accepted_candidate_fingerprint" is not null and
                "dictionary_generation_proposals"."accepted_card_id" is not null and
                "dictionary_generation_proposals"."accepted_card_version" is not null and
                "dictionary_generation_proposals"."accepted_dictionary_version" is not null and
                "dictionary_generation_proposals"."accepted_duplicate_source" is not null and
                "dictionary_generation_proposals"."accepted_revision_id" is not null and
                "dictionary_generation_proposals"."accepted_batch_outcome" is null
            ) or (
                "dictionary_generation_proposals"."accepted_candidate_fingerprint" is not null and
                "dictionary_generation_proposals"."accepted_card_id" is null and
                "dictionary_generation_proposals"."accepted_card_version" is null and
                "dictionary_generation_proposals"."accepted_dictionary_version" is null and
                "dictionary_generation_proposals"."accepted_duplicate_source" is null and
                "dictionary_generation_proposals"."accepted_revision_id" is null and
                "dictionary_generation_proposals"."accepted_batch_outcome" is not null
            ))) or ("dictionary_generation_proposals"."review_state" in ('discarded', 'expired') and "dictionary_generation_proposals"."payload" is null and "dictionary_generation_proposals"."terminal_at" is not null and "dictionary_generation_proposals"."accepted_candidate_fingerprint" is null and "dictionary_generation_proposals"."accepted_card_id" is null and "dictionary_generation_proposals"."accepted_card_version" is null and "dictionary_generation_proposals"."accepted_dictionary_version" is null and "dictionary_generation_proposals"."accepted_duplicate_source" is null and "dictionary_generation_proposals"."accepted_revision_id" is null and "dictionary_generation_proposals"."accepted_batch_outcome" is null));