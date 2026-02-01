
-- =================================================================
-- CRITICAL FIX: RUN THIS BLOCK IN SQL EDITOR TO FIX SAVING ISSUES
-- =================================================================

-- 1. Fix Primary Key (Allows different users to have same Product IDs)
alter table products drop constraint if exists products_pkey;
alter table products add primary key (id, user_id);

-- 2. Fix Permissions (Ensures INSERT/UPDATE works for everyone)
drop policy if exists "Users can all own products" on products;
create policy "Users can all own products" on products for all 
using ( auth.uid() = user_id ) 
with check ( auth.uid() = user_id );

-- 3. Add Aliases Column for Manual Mapping
alter table products add column if not exists aliases text[] default array[]::text[];

-- 4. Ensure Integration Configs has Credentials Columns (For TCS)
-- Note: The table name in code is 'integration_configs'.
-- We ensure 'integration_configs' exists and has the correct columns.
create table if not exists integration_configs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  provider_id text not null,
  api_token text,
  merchant_id text,
  username text,
  password text,
  is_active boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table integration_configs add column if not exists username text;
alter table integration_configs add column if not exists password text;
alter table integration_configs add column if not exists merchant_id text;

-- Fix Permissions for integration_configs
alter table integration_configs enable row level security;
drop policy if exists "Users can manage own integration configs" on integration_configs;
create policy "Users can manage own integration configs" on integration_configs for all using ( auth.uid() = user_id );

-- =================================================================
-- END OF CRITICAL FIX
-- =================================================================


-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Profiles Table
alter table profiles enable row level security;
drop policy if exists "Users can view own profile" on profiles;
create policy "Users can view own profile" on profiles for select using ( auth.uid() = id );
drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile" on profiles for update using ( auth.uid() = id );
drop policy if exists "Users can insert own profile" on profiles;
create policy "Users can insert own profile" on profiles for insert with check ( auth.uid() = id );

-- 2. Products Table (See Critical Fix above for PK)
alter table products enable row level security;

-- 3. Ad Spend Table
alter table ad_spend enable row level security;
drop policy if exists "Users can all own ad_spend" on ad_spend;
create policy "Users can all own ad_spend" on ad_spend for all using ( auth.uid() = user_id );

-- 4. Sales Channels
alter table sales_channels enable row level security;
drop policy if exists "Users can manage own sales channels" on sales_channels;
create policy "Users can manage own sales channels" on sales_channels for all using ( auth.uid() = user_id );

-- 5. Integration Configs
-- See Critical Fix block for table definition and policies

-- 6. App Settings
alter table app_settings enable row level security;
drop policy if exists "Users can all own settings" on app_settings;
create policy "Users can all own settings" on app_settings for all using ( auth.uid() = user_id );

-- 7. Marketing Configs
alter table marketing_configs enable row level security;
drop policy if exists "Users can manage own marketing configs" on marketing_configs;
create policy "Users can manage own marketing configs" on marketing_configs for all using ( auth.uid() = user_id );

-- 8. Campaign Mappings
alter table campaign_mappings enable row level security;
drop policy if exists "Users can manage own campaign mappings" on campaign_mappings;
create policy "Users can manage own campaign mappings" on campaign_mappings for all using ( auth.uid() = user_id );
