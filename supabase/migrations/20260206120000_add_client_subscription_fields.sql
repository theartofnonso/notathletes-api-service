alter table public.clients
  add column if not exists entitlement_source text default 'apple',
  add column if not exists subscription_product_id text,
  add column if not exists subscription_status text default 'inactive',
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists app_store_original_transaction_id text,
  add column if not exists app_store_environment text,
  add column if not exists last_subscription_event_at timestamptz,
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_clients_original_tx
  on public.clients(app_store_original_transaction_id);
