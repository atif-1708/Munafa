import { Order, AdSpend, DashboardMetrics, OrderStatus, PaymentStatus, CourierName, Product } from '../types';
import { COURIER_RATES } from '../constants';

export const calculateMetrics = (orders: Order[], adSpend: AdSpend[]): DashboardMetrics => {
  let gross_revenue = 0;
  let total_cogs = 0;
  let total_shipping_expense = 0;
  let delivered_orders = 0;
  let rto_orders = 0;
  let pending_remittance = 0;

  const total_orders = orders.length;

  orders.forEach(order => {
    const isDelivered = order.status === OrderStatus.DELIVERED;
    const isRto = order.status === OrderStatus.RETURNED;
    
    // 1. Revenue & Pending Remittance
    if (isDelivered) {
      gross_revenue += order.cod_amount;
      delivered_orders++;
      
      if (order.payment_status === PaymentStatus.UNPAID) {
        pending_remittance += order.cod_amount;
      }
    } else if (isRto) {
      rto_orders++;
    }

    // 2. Shipping Expenses (Charged regardless of success usually, plus RTO fee)
    if (order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.PENDING) {
       total_shipping_expense += order.courier_fee;
       total_shipping_expense += order.rto_penalty; // Add Return charges if applicable
       total_shipping_expense += order.packaging_cost;
    }

    // 3. COGS
    if (isDelivered) {
      order.items.forEach(item => {
        total_cogs += (item.cogs_at_time_of_order * item.quantity);
      });
    }
  });

  // 4. Marketing Costs
  const total_ad_spend = adSpend.reduce((sum, ad) => sum + ad.amount_spent, 0);

  // 5. Net Profit Formula
  const net_profit = gross_revenue - total_cogs - total_shipping_expense - total_ad_spend;

  const total_finished_orders = delivered_orders + rto_orders;
  const rto_rate = total_finished_orders > 0 ? (rto_orders / total_finished_orders) * 100 : 0;
  
  const total_investment = total_cogs + total_shipping_expense + total_ad_spend;
  const roi = total_investment > 0 ? (net_profit / total_investment) * 100 : 0;

  return {
    total_orders,
    gross_revenue,
    total_cogs,
    total_shipping_expense,
    total_ad_spend,
    net_profit,
    delivered_orders,
    rto_orders,
    rto_rate,
    pending_remittance,
    roi
  };
};

// --- New Analytical Helpers ---

export interface CourierStats {
  name: string;
  total_orders: number;
  delivered: number;
  rto: number;
  delivery_rate: number;
  cash_pending: number;
  shipping_spend: number;
}

export const calculateCourierPerformance = (orders: Order[]): CourierStats[] => {
  const stats: Record<string, CourierStats> = {};

  Object.values(CourierName).forEach(name => {
    stats[name] = { 
      name, total_orders: 0, delivered: 0, rto: 0, 
      delivery_rate: 0, cash_pending: 0, shipping_spend: 0 
    };
  });

  orders.forEach(order => {
    const s = stats[order.courier];
    if (!s) return;

    s.total_orders++;
    s.shipping_spend += (order.courier_fee + order.rto_penalty);

    if (order.status === OrderStatus.DELIVERED) {
      s.delivered++;
      if (order.payment_status === PaymentStatus.UNPAID) {
        s.cash_pending += order.cod_amount;
      }
    } else if (order.status === OrderStatus.RETURNED || order.status === OrderStatus.RTO_INITIATED) {
      s.rto++;
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
  units_sold: number;
  gross_revenue: number;
  cogs_total: number;
  gross_profit: number;
}

export const calculateProductPerformance = (orders: Order[], products: Product[]): ProductPerformance[] => {
  const perf: Record<string, ProductPerformance> = {};

  products.forEach(p => {
    perf[p.id] = {
      id: p.id, title: p.title, sku: p.sku, 
      units_sold: 0, gross_revenue: 0, cogs_total: 0, gross_profit: 0
    };
  });

  orders.forEach(order => {
    if (order.status === OrderStatus.DELIVERED) {
      order.items.forEach(item => {
        if (perf[item.product_id]) {
          const p = perf[item.product_id];
          p.units_sold += item.quantity;
          p.gross_revenue += (item.sale_price * item.quantity);
          p.cogs_total += (item.cogs_at_time_of_order * item.quantity);
        }
      });
    }
  });

  return Object.values(perf)
    .map(p => {
      p.gross_profit = p.gross_revenue - p.cogs_total;
      return p;
    })
    .sort((a, b) => b.gross_profit - a.gross_profit);
};

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};