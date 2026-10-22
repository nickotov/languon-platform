-- Deferred speech authority runs at commit under the restricted worker/purge role.
-- Its fixed search path and qualified reads preserve the numerical-only privilege seam.
ALTER FUNCTION languon_guard_speech_accounting_authority() SECURITY DEFINER;
