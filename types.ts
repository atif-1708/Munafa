
// Database Schema Representations

export enum CourierName {
  TRAX = 'Trax',
  LEOPARDS = 'Leopards',
  TCS = 'TCS',
  POSTEX = 'PostEx',
  MNP = 'M&P',
  CALLCOURIER = 'CallCourier'
}

export enum OrderStatus {
  PENDING = 'PENDING',
  BOOKED = 'BOOKED', // Label Created / Ready to Ship
  IN_TRANSIT = 'IN_TRANSIT', // Picked up by courier
  DELIVERED = 'DELIVERED', // Successfully collected COD
  RTO_INITIATED = 'RTO_INITIATED',
  RETURNED = 'RETURNED', // RTO delivered back to seller (Loss)
  CANCELLED = 'CANCELLED'
}

export enum PaymentStatus {
  UNPAID = 'UNPAID', // Courier has money
  REMITTED = 'REMITTED', // Courier paid seller
  PENDING_VERIFICATION = 'PENDING_VERIFICATION'
}

export interface Product {
  id: string;
  shopify_id: string;
  title: string;
  sku: string;
  variant_fingerprint?: string; // Slug generated from title for matching
  image_url: string;
  cost_history: {
    date: string;
    cogs: number; // Cost of Goods Sold
  }[];
  current_cogs: number;
  
  // NEW: Grouping Fields
  group_id?: string | null;
  group_name?: string | null;

  // NEW: Manual Mapping / Aliases
  aliases?: string[]; // Array of alternate titles (e.g. from Shopify)
}

export interface OrderItem {
  product_id: string;
  quantity: number;
  sale_price: number;
  product_name: string;
  sku?: string;
  variant_fingerprint?: string; 
  cogs_at_time_of_order: number;
}

export interface Order {
  id: string;
  shopify_order_number: string;
  created_at: string;
  customer_city: string;
  courier: CourierName;
  tracking_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  
  // Financials
  cod_amount: number; // The amount collected from customer
  shipping_fee_paid_by_customer: number; 
  
  // Costs
  courier_fee: number; // Actual fee charged by courier
  packaging_cost: number;
  overhead_cost: number; // New: Fixed operational cost per dispatched order
  tax_amount: number; // New: % Tax on Delivered Sales
  rto_penalty: number; // Fee charged if returned
  
  items: OrderItem[];
}

// --- NEW: Shopify Order Interfaces ---
export interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  sku: string;
  price: string;
  variant_id: number;
  product_id: number;
}

export interface ShopifyOrder {
  id: number;
  name: string; // e.g. #1024
  created_at: string;
  financial_status: string; // paid, pending, voided
  fulfillment_status: string | null; // fulfilled, null, partial
  cancel_reason: string | null; // customer, inventory, fraud
  total_price: string;
  line_items: ShopifyLineItem[];
  customer?: {
      first_name: string;
      city: string;
  };
}
// -------------------------------------

// Marketing Data
export interface AdSpend {
  id: string;
  date: string;
  platform: 'Facebook' | 'TikTok' | 'Google';
  amount_spent: number;
  product_id?: string; // ID of the product OR group this ad was for
  attributed_orders?: number;
  
  // New: Campaign Data for Auto-Sync
  campaign_id?: string;
  campaign_name?: string;
  purchases?: number; // Fetched from 'actions'
}

// New: Marketing Configuration (Facebook, etc)
export interface MarketingConfig {
    id: string;
    platform: 'Facebook' | 'TikTok' | 'Google';
    access_token: string;
    ad_account_ids: string[]; // Changed from string to string[] for multi-account support
    is_active: boolean;
}

// New: Campaign Mapping Strategy B
export interface CampaignMapping {
    campaign_id: string;
    campaign_name: string;
    product_id: string | null; // null = General Store Spend
    platform: string;
}

// Dashboard Aggregates
export interface DashboardMetrics {
  total_orders: number;
  dispatched_orders: number; // New: Orders that left warehouse
  gross_revenue: number;
  total_cogs: number;
  total_shipping_expense: number; // Forward + Return
  total_overhead_cost: number; // New
  total_courier_tax: number; // New
  total_ad_spend: number;
  total_ads_tax: number; // New: Tax on Ads
  gross_profit: number; // Revenue - Realized COGS - Expenses (Before Cash Stuck)
  net_profit: number;
  delivered_orders: number;
  rto_orders: number;
  in_transit_orders: number;
  booked_orders: number;
  unbooked_orders: number;
  rto_rate: number;
  pending_remittance: number; // Cash with couriers
  cash_in_transit_stock: number; // Cost of inventory currently dispatched but not delivered (In Transit + RTO)
  roi: number; // Return on Investment
}

// --- Integrations ---

export interface SalesChannel {
  id: string;
  platform: 'Shopify' | 'WooCommerce';
  store_url: string;
  api_key?: string; // New: Client ID
  access_token: string;
  scope?: string;
  is_active: boolean;
  last_sync_at?: string;
}

export interface CourierConfig {
  id: string;
  courier_id: string; // CourierName
  api_token: string;
  merchant_id?: string; // Some couriers need AccountID + Token
  username?: string;
  password?: string;
  is_active: boolean;
  base_url?: string; // Optional override
}

export interface IntegrationConfig {
  id: string;
  provider_id: string;
  api_token: string;
  is_active: boolean;
  merchant_id?: string;
  username?: string;
  password?: string;
}

export interface TrackingUpdate {
  tracking_number: string;
  status: OrderStatus;
  raw_status_text: string;
  courier_timestamp: string;
  balance_payable?: number; // Some couriers return the balance for this order
}
