
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Profiles Table
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  store_name text,
  created_at timestamptz default now()
);
alter table profiles enable row level security;

-- Policies for profiles
drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile" on profiles for select using ( auth.uid() = id );

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile" on profiles for update using ( auth.uid() = id );

drop policy if exists "Users can insert own profile" on profiles;
create policy "Users can insert own profile" on profiles for insert with check ( auth.uid() = id );

-- 2. Products Table
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
  product_id text,
  attributed_orders numeric,
  campaign_id text, -- New
  campaign_name text, -- New
  created_at timestamptz default now()
);
alter table ad_spend enable row level security;

drop policy if exists "Users can all own ad_spend" on ad_spend;
create policy "Users can all own ad_spend" on ad_spend for all using ( auth.uid() = user_id );

-- 4. SALES CHANNELS TABLE (UPDATED: Removed api_key to match manual integration)
create table if not exists sales_channels (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  platform text not null check (platform in ('Shopify', 'WooCommerce')),
  store_url text not null,
  access_token text, -- OAuth Token / Admin Token
  scope text,
  is_active boolean default true,
  last_sync_at timestamptz,
  created_at timestamptz default now(),
  unique(user_id, platform) -- Limit 1 per platform per user for now
);
alter table sales_channels enable row level security;

drop policy if exists "Users can manage own sales channels" on sales_channels;
create policy "Users can manage own sales channels" on sales_channels for all using ( auth.uid() = user_id );

-- 5. COURIER CONFIGS TABLE (NEW: Replaces integration_configs for Logistics)
create table if not exists courier_configs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  courier_id text not null, -- 'Trax', 'PostEx', 'Leopards'
  api_token text,
  merchant_id text,
  username text,
  password text,
  base_url text,
  is_active boolean default false,
  created_at timestamptz default now(),
  unique(user_id, courier_id)
);
alter table courier_configs enable row level security;

drop policy if exists "Users can manage own courier configs" on courier_configs;
create policy "Users can manage own courier configs" on courier_configs for all using ( auth.uid() = user_id );

-- 6. App Settings Table
create table if not exists app_settings (
  user_id uuid references auth.users on delete cascade primary key,
  packaging_cost numeric default 0,
  overhead_cost numeric default 0,
  courier_tax_rate numeric default 0,
  ads_tax_rate numeric default 0,
  courier_rates jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
alter table app_settings enable row level security;

drop policy if exists "Users can all own settings" on app_settings;
create policy "Users can all own settings" on app_settings for all using ( auth.uid() = user_id );

-- 7. Marketing Configs (Facebook, TikTok, Google)
-- Updated: ad_account_ids (jsonb) replaces ad_account_id
create table if not exists marketing_configs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  platform text not null, -- 'Facebook', 'TikTok', 'Google'
  access_token text,
  ad_account_ids jsonb, -- Stores array of strings ['act_123', 'act_456']
  is_active boolean default false,
  created_at timestamptz default now(),
  unique(user_id, platform)
);
alter table marketing_configs enable row level security;
drop policy if exists "Users can manage own marketing configs" on marketing_configs;
create policy "Users can manage own marketing configs" on marketing_configs for all using ( auth.uid() = user_id );

-- 8. Campaign Mappings (Strategy B)
create table if not exists campaign_mappings (
  user_id uuid references auth.users on delete cascade not null,
  campaign_id text not null,
  campaign_name text,
  product_id text, -- Can be null (General) or Product ID or Group ID
  platform text,
  updated_at timestamptz default now(),
  primary key (user_id, campaign_id)
);
alter table campaign_mappings enable row level security;
drop policy if exists "Users can manage own campaign mappings" on campaign_mappings;
create policy "Users can manage own campaign mappings" on campaign_mappings for all using ( auth.uid() = user_id );
