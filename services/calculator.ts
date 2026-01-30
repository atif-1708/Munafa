
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

       // Cash in Stock = Cost of all skus except booked, unbooked, delivered (and cancelled)
       // Essentially: Cost of Inventory currently floating in the courier network
       if (!isDelivered) {
           cash_in_transit_stock += orderCost;
       }
    }
  });

  // 4. Marketing Costs & Tax
  const raw_ad_spend = adSpend.reduce((sum, ad) => sum + ad.amount_spent, 0);
  const total_ads_tax = raw_ad_spend * (adsTaxRate / 100);
  const total_ad_spend = raw_ad_spend + total_ads_tax;

  // 5. Net Profit Formula (Cash Basis)
  // Revenue (Realized) - COGS (All Dispatched) - Shipping - Overhead - Tax - Ads
  const net_profit = gross_revenue - total_cogs - total_shipping_expense - total_overhead_cost - total_courier_tax - total_ad_spend;

  // Gross Profit (Operational Profit AFTER Ads)
  // Logic: Net Profit + Cash Stuck.
  // This essentially means: Realized Revenue - Realized COGS - Expenses (Before Cash Stuck) - ADS.
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
  gross_revenue: number;
  cogs_total: number;
  gross_profit: number; 
  cash_in_stock: number;
  shipping_cost_allocation: number;
  overhead_allocation: number;
  tax_allocation: number;
  ad_spend_allocation: number;
  marketing_purchases: number; // NEW: Facebook Pixel Purchase Count
  net_profit: number;
  rto_rate: number;
}

export const calculateProductPerformance = (
    orders: Order[], 
    products: Product[],
    adSpend: AdSpend[] = [],
    adsTaxRate: number = 0
): ProductPerformance[] => {
  const perf: Record<string, ProductPerformance> = {};

  // 1. Initialize
  products.forEach(p => {
    // Sum relevant ads (DIRECT MATCH ONLY - Group ads handled in Profitability.tsx view)
    const relevantAds = adSpend.filter(a => a.product_id === p.id);
    const rawAdSpend = relevantAds.reduce((sum, a) => sum + a.amount_spent, 0);
    const adPurchases = relevantAds.reduce((sum, a) => sum + (a.purchases || 0), 0); // Aggregate purchases
    const totalAdSpend = rawAdSpend * (1 + adsTaxRate / 100);
    
    // Key by Fingerprint (preferred) or SKU
    const lookupKey = p.variant_fingerprint || p.sku;

    perf[lookupKey] = {
      id: p.id, title: p.title, sku: p.sku, 
      group_id: p.group_id, group_name: p.group_name,
      units_sold: 0, 
      units_returned: 0,
      units_in_transit: 0,
      gross_revenue: 0, 
      cogs_total: 0,
      gross_profit: 0,
      cash_in_stock: 0,
      shipping_cost_allocation: 0,
      overhead_allocation: 0,
      tax_allocation: 0,
      ad_spend_allocation: totalAdSpend,
      marketing_purchases: adPurchases, // Set aggregated purchases
      net_profit: 0,
      rto_rate: 0
    };
  });

  // 2. Process Courier Orders (Financials)
  orders.forEach(order => {
    const itemCount = order.items.length;
    if (itemCount === 0) return;

    // Shipping Allocation Logic: Even split per item
    // NOTE: We only allocate shipping cost if the order is in a chargeable status
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
        // MATCHING: Fingerprint -> SKU -> ID
        const productDef = 
            products.find(p => p.variant_fingerprint && p.variant_fingerprint === item.variant_fingerprint) || 
            products.find(p => p.sku === item.sku) ||
            products.find(p => p.id === item.product_id);
        
        // Lookup Key (Consistently use fingerprint if available)
        const key = item.variant_fingerprint || item.sku || item.product_id;
        
        if (!perf[key]) {
             // If unknown product found in orders (Dynamic Creation)
             perf[key] = {
                 id: item.product_id, title: item.product_name, sku: item.sku || 'N/A',
                 units_sold: 0, units_returned: 0, units_in_transit: 0,
                 gross_revenue: 0, cogs_total: 0, gross_profit: 0, cash_in_stock: 0,
                 shipping_cost_allocation: 0, overhead_allocation: 0, tax_allocation: 0,
                 ad_spend_allocation: 0, marketing_purchases: 0, net_profit: 0, rto_rate: 0
             };
        }
        
        const p = perf[key];
        // Historical COGS calculation
        const historicalCogs = productDef ? getCostAtDate(productDef, order.created_at) : item.cogs_at_time_of_order;

        if (isChargeable) {
            // Apply overhead to all dispatched items
            p.overhead_allocation += (overheadPerItem * item.quantity);
        }

        // RTO Logic
        if (order.status === OrderStatus.RETURNED || order.status === OrderStatus.RTO_INITIATED) {
             p.units_returned += item.quantity;
             p.shipping_cost_allocation += (shippingPerItem * item.quantity); 
             // RTO is technically stock stuck in the network until received
             p.cash_in_stock += (historicalCogs * item.quantity);
        }
        // Delivered Logic
        else if (order.status === OrderStatus.DELIVERED) {
             p.units_sold += item.quantity;
             p.gross_revenue += (item.sale_price * item.quantity);
             p.cogs_total += (historicalCogs * item.quantity); // Realized Cost
             p.shipping_cost_allocation += (shippingPerItem * item.quantity);
             p.tax_allocation += (taxPerItem * item.quantity); // Tax applies only on success
        }
        // In Transit / Dispatched
        else if (isChargeable) {
            p.shipping_cost_allocation += (shippingPerItem * item.quantity);
            p.units_in_transit += item.quantity;
            p.cash_in_stock += (historicalCogs * item.quantity);
        }
    });
  });

  return Object.values(perf)
    .map(p => {
      // Net Profit = Revenue - All Expenses (Realized COGS, Shipping, Overhead, Tax, Ads) - Stuck Stock
      const expenses = p.cogs_total + p.shipping_cost_allocation + p.overhead_allocation + p.tax_allocation + p.ad_spend_allocation;
      
      p.net_profit = p.gross_revenue - expenses - p.cash_in_stock;

      // Gross Profit (Modified) -> NOW SUBTRACTS ADS.
      // Logic: Net Profit + Cash Stuck (Asset).
      // This is effectively: Revenue - Realized Expenses (including Ads).
      p.gross_profit = p.net_profit + p.cash_in_stock;
      
      const closed_orders = p.units_sold + p.units_returned;
      p.rto_rate = closed_orders > 0 ? (p.units_returned / closed_orders) * 100 : 0;
      
      return p;
    })
    .sort((a, b) => b.net_profit - a.net_profit); // Sort by Net Profit descending
};
