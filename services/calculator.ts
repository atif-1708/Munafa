
import { Order, AdSpend, DashboardMetrics, OrderStatus, PaymentStatus, CourierName, Product, ShopifyOrder } from '../types';
import { COURIER_RATES } from '../constants';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const calculateMetrics = (
    orders: Order[], 
    adSpend: AdSpend[], 
    adsTaxRate: number = 0
): DashboardMetrics => {
  let gross_revenue = 0;
  let total_cogs = 0;
  let cash_in_transit_stock = 0;
  let total_shipping_expense = 0;
  let total_overhead_cost = 0;
  let total_courier_tax = 0;
  let dispatched_orders = 0;
  let delivered_orders = 0;
  let rto_orders = 0;
  let in_transit_orders = 0;
  let booked_orders = 0;
  let unbooked_orders = 0;
  let pending_remittance = 0;

  const total_orders = orders.length;

  orders.forEach(order => {
    const isDelivered = order.status === OrderStatus.DELIVERED;
    const isRto = order.status === OrderStatus.RETURNED || order.status === OrderStatus.RTO_INITIATED;
    const isCancelled = order.status === OrderStatus.CANCELLED;
    const isPending = order.status === OrderStatus.PENDING;
    const isBooked = order.status === OrderStatus.BOOKED;
    const isInTransit = order.status === OrderStatus.IN_TRANSIT;

    const isDispatched = !isCancelled && !isPending && !isBooked;

    if (isInTransit) in_transit_orders++;
    if (isBooked) booked_orders++;
    if (isPending) unbooked_orders++;

    // 1. Revenue & Pending Remittance
    if (isDelivered) {
      gross_revenue += order.cod_amount;
      delivered_orders++;
      
      // Accumulate Tax (Only on Delivered)
      total_courier_tax += order.tax_amount;

      if (order.payment_status === PaymentStatus.UNPAID) {
        pending_remittance += order.cod_amount;
      }
    } else if (isRto) {
      rto_orders++;
    }

    // 2. Operational Expenses (Charged on Dispatched)
    // EXCLUDE: Cancelled, Pending (Unbooked), and Booked
    if (isDispatched) {
       dispatched_orders++;

       total_shipping_expense += order.courier_fee;
       total_shipping_expense += order.rto_penalty; // Add Return charges if applicable
       total_shipping_expense += order.packaging_cost;
       
       total_overhead_cost += order.overhead_cost;

       // 3. COGS & Cash in Stock Logic
       // Total COGS = Cost of all SKUs except booked and unbooked (and cancelled)
       const orderCost = order.items.reduce((sum, item) => sum + (item.cogs_at_time_of_order * item.quantity), 0);
       total_cogs += orderCost;

       // Cash in Stock
       // STRICT: Only count as "Stuck" if it is Returned or RTO Initiated.
       if (isRto) {
           cash_in_transit_stock += orderCost;
       }
    }
  });

  // 4. Marketing Costs & Tax
  let total_ad_spend = 0;
  let total_ads_tax = 0;

  adSpend.forEach(ad => {
      let tax = 0;
      // Requirement: Do NOT apply tax to TikTok spend. Apply to Facebook/Google/Others.
      if (ad.platform !== 'TikTok') {
          tax = ad.amount_spent * (adsTaxRate / 100);
      }
      total_ads_tax += tax;
      total_ad_spend += (ad.amount_spent + tax);
  });

  // 5. Net Profit Formula (Cash Basis)
  // Revenue (Realized) - COGS (All Dispatched) - Shipping - Overhead - Tax - Ads
  const net_profit = gross_revenue - total_cogs - total_shipping_expense - total_overhead_cost - total_courier_tax - total_ad_spend;

  // Gross Profit (Operational Profit AFTER Ads)
  // Logic: Net Profit + Cash Stuck.
  const gross_profit = net_profit + cash_in_transit_stock;

  const total_finished_orders = delivered_orders + rto_orders;
  const rto_rate = total_finished_orders > 0 ? (rto_orders / total_finished_orders) * 100 : 0;
  
  // ROI: Profit / Investment. 
  const total_investment = total_cogs + total_shipping_expense + total_overhead_cost + total_ad_spend;
  const roi = total_investment > 0 ? (net_profit / total_investment) * 100 : 0;

  return {
    total_orders,
    dispatched_orders,
    gross_revenue,
    total_cogs,
    total_shipping_expense,
    total_overhead_cost,
    total_courier_tax,
    total_ad_spend,
    total_ads_tax,
    gross_profit,
    net_profit,
    delivered_orders,
    rto_orders,
    in_transit_orders,
    booked_orders,
    unbooked_orders,
    rto_rate,
    pending_remittance,
    cash_in_transit_stock,
    roi
  };
};

// --- Helper: Date-Based Costing ---
export const getCostAtDate = (product: Product, dateStr: string): number => {
    if (!product.cost_history || product.cost_history.length === 0) {
        return product.current_cogs;
    }

    const orderDate = new Date(dateStr).getTime();
    
    // Sort history: Newest first
    const sortedHistory = [...product.cost_history].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Find the first history entry that is BEFORE or ON the order date
    const applicable = sortedHistory.find(h => new Date(h.date).getTime() <= orderDate);

    // If found, that's the cost. 
    // If not found (order is older than all history), use the oldest history entry.
    return applicable ? applicable.cogs : sortedHistory[sortedHistory.length - 1].cogs;
};

// --- Helper: Normalize Title for Fuzzy Match ---
export const normalizeProductTitle = (title: string): string => {
    if (!title) return '';
    return title
        .toLowerCase()
        .replace(/\(.*\)/g, '') // Remove (anything)
        .replace(/\[.*\]/g, '') // Remove [anything]
        .replace(/-.*/g, '')    // Remove - anything (often variant name)
        .replace(/\d+x/g, '')   // Remove 2x, 3x (quantity markers)
        .replace(/x\d+/g, '')   // Remove x2, x3
        .replace(/\d+\s?pc[s]?/g, '') // Remove 2 pcs
        .replace(/[^\w\s]/gi, '') // Remove remaining special chars
        .trim();
};

// --- Analytical Helpers ---

export interface CourierStats {
  name: string;
  total_orders: number;
  delivered: number;
  rto: number;
  in_transit: number;
  delivery_rate: number;
  cash_pending: number;
  shipping_spend: number;
}

export const calculateCourierPerformance = (orders: Order[]): CourierStats[] => {
  const stats: Record<string, CourierStats> = {};

  Object.values(CourierName).forEach(name => {
    stats[name] = { 
      name, total_orders: 0, delivered: 0, rto: 0, in_transit: 0,
      delivery_rate: 0, cash_pending: 0, shipping_spend: 0 
    };
  });

  orders.forEach(order => {
    const s = stats[order.courier];
    if (!s) return;

    // EXCLUDE: Booked, Pending (Unbooked), and Cancelled.
    const isDispatched = order.status !== OrderStatus.PENDING && 
                         order.status !== OrderStatus.BOOKED && 
                         order.status !== OrderStatus.CANCELLED;

    if (!isDispatched) return;

    s.total_orders++;
    s.shipping_spend += (order.courier_fee + order.rto_penalty);

    if (order.status === OrderStatus.DELIVERED) {
      s.delivered++;
      if (order.payment_status === PaymentStatus.UNPAID) {
        s.cash_pending += order.cod_amount;
      }
    } else if (order.status === OrderStatus.RETURNED || order.status === OrderStatus.RTO_INITIATED) {
      s.rto++;
    } else if (order.status === OrderStatus.IN_TRANSIT) {
      s.in_transit++;
    }
  });

  return Object.values(stats).map(s => {
    const closed_orders = s.delivered + s.rto;
    s.delivery_rate = closed_orders > 0 ? (s.delivered / closed_orders) * 100 : 0;
    return s;
  }).sort((a, b) => b.delivery_rate - a.delivery_rate);
};

export interface ProductPerformance {
  id: string;
  title: string;
  sku: string;
  group_id?: string | null;
  group_name?: string | null;
  units_sold: number;
  units_returned: number;
  units_in_transit: number; 
  real_order_count: number; 
  gross_revenue: number;
  cogs_total: number;
  gross_profit: number; 
  cash_in_stock: number;
  shipping_cost_allocation: number;
  overhead_allocation: number;
  tax_allocation: number;
  ad_spend_allocation: number;
  
  // NEW Metrics
  shopify_total_orders: number; // Raw Shopify Demand (All Statuses)
  shopify_confirmed_orders: number; // Fulfilled/Partial Shopify Orders
  associatedShopifyOrders: ShopifyOrder[]; // Actual list of orders
  marketing_purchases: number; // Legacy Pixel data (kept for reference)
  
  net_profit: number;
  rto_rate: number;
}

export const calculateProductPerformance = (
    orders: Order[], 
    products: Product[],
    adSpend: AdSpend[] = [],
    adsTaxRate: number = 0,
    shopifyOrders: ShopifyOrder[] = [] // New Param
): ProductPerformance[] => {
  // Aggregate by TITLE instead of SKU/ID
  const perf: Record<string, ProductPerformance> = {};
  const orderTracker: Record<string, Set<string>> = {};

  // 1. Initialize from Product Definitions
  products.forEach(p => {
    const lookupKey = p.title; 

    if (!perf[lookupKey]) {
        perf[lookupKey] = {
            id: p.title, // ID is Title for aggregation
            title: p.title,
            sku: 'VARIOUS', 
            group_id: p.group_id,
            group_name: p.group_name,
            units_sold: 0, 
            units_returned: 0,
            units_in_transit: 0,
            real_order_count: 0,
            gross_revenue: 0, 
            cogs_total: 0,
            gross_profit: 0,
            cash_in_stock: 0,
            shipping_cost_allocation: 0,
            overhead_allocation: 0,
            tax_allocation: 0,
            ad_spend_allocation: 0,
            marketing_purchases: 0, 
            shopify_total_orders: 0,
            shopify_confirmed_orders: 0,
            associatedShopifyOrders: [],
            net_profit: 0,
            rto_rate: 0
        };
        orderTracker[lookupKey] = new Set();
    }
  });

  // 2. Process Courier Orders (Financials)
  orders.forEach(order => {
    const itemCount = order.items.length;
    if (itemCount === 0) return;

    const isChargeable = order.status !== OrderStatus.CANCELLED && 
                         order.status !== OrderStatus.PENDING &&
                         order.status !== OrderStatus.BOOKED;

    const totalOrderShippingCost = isChargeable 
        ? order.courier_fee + order.rto_penalty + order.packaging_cost
        : 0;
        
    const shippingPerItem = totalOrderShippingCost / itemCount;
    const overheadPerItem = isChargeable ? (order.overhead_cost / itemCount) : 0;
    const taxPerItem = order.status === OrderStatus.DELIVERED ? (order.tax_amount / itemCount) : 0;

    order.items.forEach(item => {
        // Find exact product def for Costing
        const productDef = 
            products.find(p => p.variant_fingerprint && p.variant_fingerprint === item.variant_fingerprint) || 
            products.find(p => p.sku === item.sku) ||
            products.find(p => p.id === item.product_id);
        
        const key = productDef ? productDef.title : item.product_name;
        
        if (!perf[key]) {
             // Fallback if not initialized
             perf[key] = {
                 id: key, title: key, sku: 'UNKNOWN',
                 units_sold: 0, units_returned: 0, units_in_transit: 0, real_order_count: 0,
                 gross_revenue: 0, cogs_total: 0, gross_profit: 0, cash_in_stock: 0,
                 shipping_cost_allocation: 0, overhead_allocation: 0, tax_allocation: 0,
                 ad_spend_allocation: 0, marketing_purchases: 0, 
                 shopify_total_orders: 0, shopify_confirmed_orders: 0, associatedShopifyOrders: [],
                 net_profit: 0, rto_rate: 0
             };
             orderTracker[key] = new Set();
        }
        
        // Track Real Order (Dispatched)
        if (isChargeable) {
            orderTracker[key].add(order.id);
        }

        const p = perf[key];
        const historicalCogs = productDef ? getCostAtDate(productDef, order.created_at) : item.cogs_at_time_of_order;

        if (isChargeable) {
            p.overhead_allocation += (overheadPerItem * item.quantity);
        }

        if (order.status === OrderStatus.RETURNED || order.status === OrderStatus.RTO_INITIATED) {
             p.units_returned += item.quantity;
             p.shipping_cost_allocation += (shippingPerItem * item.quantity); 
             // CASH STUCK: Only apply for Returned/RTO as requested
             p.cash_in_stock += (historicalCogs * item.quantity);
        }
        else if (order.status === OrderStatus.DELIVERED) {
             p.units_sold += item.quantity;
             p.gross_revenue += (item.sale_price * item.quantity);
             p.cogs_total += (historicalCogs * item.quantity); 
             p.shipping_cost_allocation += (shippingPerItem * item.quantity);
             p.tax_allocation += (taxPerItem * item.quantity);
        }
        else if (isChargeable) {
            // IN TRANSIT
            p.shipping_cost_allocation += (shippingPerItem * item.quantity);
            p.units_in_transit += item.quantity;
            // Removed cash_in_stock accumulation for In Transit as requested
        }
    });
  });

  // 3. Process Ad Spend
  adSpend.forEach(ad => {
      const taxRateToApply = ad.platform === 'TikTok' ? 0 : adsTaxRate;
      const amount = ad.amount_spent * (1 + taxRateToApply / 100);
      const purchases = ad.purchases || 0;

      let match = products.find(p => p.id === ad.product_id);
      if (!match && ad.product_id) {
          match = products.find(p => p.group_id === ad.product_id);
      }

      if (match) {
          const key = match.title;
          if (perf[key]) {
              perf[key].ad_spend_allocation += amount;
              perf[key].marketing_purchases += purchases;
          }
      }
  });

  // 4. Process Shopify Orders for Demand & CPA
  // RULE: Consider only the FIRST item in the order for attribution
  shopifyOrders.forEach(order => {
        if (!order.line_items || order.line_items.length === 0) return;

        // Take only the first item
        const item = order.line_items[0];

        const isConfirmed = order.fulfillment_status === 'fulfilled' || order.fulfillment_status === 'partial';
        const itemTitleNorm = normalizeProductTitle(item.title);
        
        // Try matching to existing performance keys
        const allKeys = Object.keys(perf);
        let matchedKey: string | null = null;
        
        // 1. Exact Title Match (fast)
        if (perf[item.title]) {
            matchedKey = item.title;
        } else {
            // 2. Normalized Exact Match
            matchedKey = allKeys.find(k => normalizeProductTitle(k) === itemTitleNorm) || null;
            
            // 3. Smart Contains Match (aggressive fuzzy match)
            if (!matchedKey) {
                matchedKey = allKeys.find(k => {
                    const kNorm = normalizeProductTitle(k);
                    // Match if one contains the other, ensure reasonable length to avoid 'a' matching 'apple'
                    return kNorm.length > 2 && itemTitleNorm.length > 2 && (kNorm.includes(itemTitleNorm) || itemTitleNorm.includes(kNorm));
                }) || null;
            }
        }

        if (matchedKey) {
            perf[matchedKey].shopify_total_orders += 1;
            if (isConfirmed) {
                perf[matchedKey].shopify_confirmed_orders += 1;
            }
            // Store reference for detail view
            perf[matchedKey].associatedShopifyOrders.push(order);
        }
  });

  return Object.values(perf)
    .map(p => {
      const expenses = p.cogs_total + p.shipping_cost_allocation + p.overhead_allocation + p.tax_allocation + p.ad_spend_allocation;
      
      p.real_order_count = orderTracker[p.id]?.size || 0;

      p.net_profit = p.gross_revenue - expenses - p.cash_in_stock;
      p.gross_profit = p.net_profit + p.cash_in_stock;
      
      const closed_orders = p.units_sold + p.units_returned;
      p.rto_rate = closed_orders > 0 ? (p.units_returned / closed_orders) * 100 : 0;
      
      return p;
    })
    .sort((a, b) => b.net_profit - a.net_profit);
};
