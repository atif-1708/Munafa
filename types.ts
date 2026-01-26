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
  IN_TRANSIT = 'IN_TRANSIT',
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
  image_url: string;
  cost_history: {
    date: string;
    cogs: number; // Cost of Goods Sold
  }[];
  current_cogs: number;
}

export interface OrderItem {
  product_id: string;
  quantity: number;
  sale_price: number;
  product_name: string;
  sku?: string;
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
  rto_penalty: number; // Fee charged if returned
  
  items: OrderItem[];
}

// Marketing Data
export interface AdSpend {
  id: string;
  date: string;
  platform: 'Facebook' | 'TikTok' | 'Google';
  amount_spent: number;
  attributed_orders?: number; // Optional simplified attribution
}

// Dashboard Aggregates
export interface DashboardMetrics {
  total_orders: number;
  gross_revenue: number;
  total_cogs: number;
  total_shipping_expense: number; // Forward + Return
  total_ad_spend: number;
  net_profit: number;
  delivered_orders: number;
  rto_orders: number;
  rto_rate: number;
  pending_remittance: number; // Cash with couriers
  roi: number; // Return on Investment
}

// --- Integrations ---

export interface IntegrationConfig {
  id: string;
  courier: CourierName;
  api_token: string;
  merchant_id?: string; // Some couriers need AccountID + Token
  username?: string;
  password?: string;
  is_active: boolean;
  base_url?: string; // Optional override
}

export interface TrackingUpdate {
  tracking_number: string;
  status: OrderStatus;
  raw_status_text: string;
  courier_timestamp: string;
  balance_payable?: number; // Some couriers return the cash balance for this order
}