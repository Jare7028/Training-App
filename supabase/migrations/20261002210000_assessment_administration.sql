-- Preserve existing assessments and attempts. Their original section timers
-- continue working; new assessments can opt into a shared work timer.
alter table public.assessments add column config jsonb
    check (config is null or jsonb_typeof(config) = 'object');
