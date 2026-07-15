-- Prevent run bleeding: end_time must be strictly after start_time
ALTER TABLE public.completed_paths
  ADD CONSTRAINT completed_paths_end_after_start
  CHECK (end_time > start_time);