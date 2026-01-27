
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Profiles Table
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  store_name text,
  created_at timestamptz default now()
);
alter table profiles enable row level security;

-- Drop policies if they exist to avoid errors on re-run
drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile" on profiles for select using ( auth.uid() = id );

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile" on profiles for update using ( auth.uid() = id );

drop policy if exists "Users can insert own profile" on profiles;
create policy "Users can insert own profile" on profiles for insert with check ( auth.uid() = id );

-- 2. Products Table
-- ID is text to support external IDs (like Shopify GIDs or Courier IDs)
create table if not exists products (
  id text primary key, 
  user_id uuid references auth.users on delete cascade not null,
  shopify_id text,
  title text,
  sku text,
  image_url text,
  current_cogs numeric,
  cost_history jsonb,
  group_id text,
  group_name text,
  created_at timestamptz default now()
);
alter table products enable row level security;

drop policy if exists "Users can all own products" on products;
create policy "Users can all own products" on products for all using ( auth.uid() = user_id );

-- 3. Ad Spend Table
create table if not exists ad_spend (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users on delete cascade not null,
  date date not null,
  platform text not null,
  amount_spent numeric not null,
  product_id text, -- References products(id) but loosely
  attributed_orders numeric,
  created_at timestamptz default now()
);
alter table ad_spend enable row level security;

drop policy if exists "Users can all own ad_spend" on ad_spend;
create policy "Users can all own ad_spend" on ad_spend for all using ( auth.uid() = user_id );

-- 4. Integration Configs Table
create table if not exists integration_configs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  courier text not null,
  api_token text,
  merchant_id text,
  username text,
  password text,
  base_url text,
  is_active boolean default false,
  created_at timestamptz default now(),
  unique(user_id, courier)
);
alter table integration_configs enable row level security;

drop policy if exists "Users can all own configs" on integration_configs;
create policy "Users can all own configs" on integration_configs for all using ( auth.uid() = user_id );

-- 5. App Settings Table
create table if not exists app_settings (
  user_id uuid references auth.users on delete cascade primary key,
  packaging_cost numeric default 0,
  overhead_cost numeric default 0, -- NEW: Fixed cost per dispatched order
  courier_tax_rate numeric default 0, -- NEW: Tax % on delivered sales
  ads_tax_rate numeric default 0, -- NEW: Tax % on Ad Spend (GST/VAT)
  courier_rates jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
alter table app_settings enable row level security;

drop policy if exists "Users can all own settings" on app_settings;
create policy "Users can all own settings" on app_settings for all using ( auth.uid() = user_id );
