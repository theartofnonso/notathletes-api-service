create table if not exists public.apple_subscription_events (
  id bigserial primary key,
  notification_uuid text unique not null,
  notification_type text not null,
  subtype text,
  original_transaction_id text,
  transaction_id text,
  signed_date timestamptz,
  raw_payload jsonb not null,
  processed_at timestamptz not null default now()
);
