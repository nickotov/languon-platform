CREATE INDEX "dictionary_audio_assets_owner_idx" ON "dictionary_audio_assets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "dictionary_audio_assets_retention_idx" ON "dictionary_audio_assets" USING btree ("state","last_accessed_at");--> statement-breakpoint
CREATE INDEX "dictionary_audio_bindings_job_idx" ON "dictionary_audio_bindings" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "dictionary_audio_jobs_claim_idx" ON "dictionary_audio_jobs" USING btree ("state","next_poll_at");--> statement-breakpoint
CREATE INDEX "dictionary_audio_jobs_budget_idx" ON "dictionary_audio_jobs" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_audio_jobs_asset_unique" ON "dictionary_audio_jobs" USING btree ("asset_id");