begin;
-- Unsaved assessments and standalone modules have no saved assessment reference.
-- Preview snapshots retain existing owner isolation, expiry and protected access.
alter table public.preview_attempts alter column assessment_id drop not null;
commit;
