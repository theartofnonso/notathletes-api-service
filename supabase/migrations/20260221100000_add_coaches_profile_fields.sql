-- Add profile display fields to coaches
alter table public.coaches
  add column if not exists profile_image_url text,
  add column if not exists description text;
