import { Order, OrderStatus, PaymentStatus, CourierName, AdSpend, Product } from '../types';
import { COURIER_RATES, CITIES, MOCK_PRODUCTS, PACKAGING_COST_AVG } from '../constants';

const generateId = () => Math.random().toString(36).substr(2, 9);

const randomDate = (start: Date, end: Date) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
};

// Generate Mock Products
export const getProducts = (): Product[] => {
  return MOCK_PRODUCTS.map(p => ({
    id: generateId(),
    shopify_id: `gid://shopify/Product/${generateId()}`,
    title: p.title,
    sku: p.sku,
    image_url: `https://picsum.photos/200?random=${Math.random()}`,
    current_cogs: p.cogs,
    cost_history: [
      { date: '2023-01-01', cogs: p.cogs * 0.9 },
      { date: '2023-06-01', cogs: p.cogs }
    ]
  }));
};

// Generate Mock Ad Spend
export const getAdSpend = (): AdSpend[] => {
  const expenses: AdSpend[] = [];
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(now.getDate() - i);
    
    // Facebook (Meta) - Major spend usually
    expenses.push({
      id: generateId(),
      date: date.toISOString(),
      platform: 'Facebook',
      amount_spent: Math.floor(Math.random() * 5000) + 2000 // 2000-7000 PKR daily
    });

    // TikTok - Growing in Pakistan
    if (Math.random() > 0.5) {
      expenses.push({
        id: generateId(),
        date: date.toISOString(),
        platform: 'TikTok',
        amount_spent: Math.floor(Math.random() * 3000) + 1000
      });
    }
  }
  return expenses;
};

// Generate Mock Orders
export const getOrders = (products: Product[]): Order[] => {
  const orders: Order[] = [];
  const now = new Date();
  
  // Ensure we have products to work with
  const availableProducts = (products && products.length > 0) ? products : getProducts();

  for (let i = 0; i < 150; i++) {
    const isRecent = i < 20;
    const orderDate = new Date();
    orderDate.setDate(now.getDate() - Math.floor(Math.random() * 30));
    
    const product = availableProducts[Math.floor(Math.random() * availableProducts.length)];
    const quantity = Math.random() > 0.8 ? 2 : 1;
    const salePrice = (MOCK_PRODUCTS.find(p => p.sku === product.sku)?.price || 1000) * quantity;
    
    // Determine Courier
    const courierValues = Object.values(CourierName);
    const courier = courierValues[Math.floor(Math.random() * courierValues.length)];
    const rates = COURIER_RATES[courier];

    // Determine Status (Heavy RTO simulation for realism)
    let status = OrderStatus.DELIVERED;
    let paymentStatus = PaymentStatus.REMITTED;
    const rand = Math.random();

    if (isRecent) {
      status = OrderStatus.IN_TRANSIT;
      paymentStatus = PaymentStatus.UNPAID;
    } else if (rand > 0.85) {
      status = OrderStatus.RETURNED; // 15% RTO
      paymentStatus = PaymentStatus.UNPAID; // No money collected
    } else if (rand > 0.80) {
      status = OrderStatus.RTO_INITIATED;
      paymentStatus = PaymentStatus.UNPAID;
    } else if (rand > 0.65) {
        status = OrderStatus.DELIVERED;
        paymentStatus = PaymentStatus.UNPAID; // Delivered but courier holds cash
    }

    const isRto = status === OrderStatus.RETURNED || status === OrderStatus.RTO_INITIATED;

    orders.push({
      id: generateId(),
      shopify_order_number: `#${1000 + i}`,
      created_at: orderDate.toISOString(),
      customer_city: CITIES[Math.floor(Math.random() * CITIES.length)],
      courier: courier,
      tracking_number: `PK${Math.floor(Math.random() * 100000000)}`,
      status: status,
      payment_status: paymentStatus,
      cod_amount: salePrice, // Free shipping for customer assumed usually, or included
      shipping_fee_paid_by_customer: 0,
      
      courier_fee: rates.forward,
      rto_penalty: isRto ? rates.rto : 0,
      packaging_cost: PACKAGING_COST_AVG,
      overhead_cost: 0,
      tax_amount: 0,
      
      items: [{
        product_id: product.id,
        quantity: quantity,
        sale_price: salePrice / quantity,
        product_name: product.title,
        sku: product.sku,
        variant_fingerprint: product.sku, // Ensure mock data has fingerprint for consistency
        cogs_at_time_of_order: product.current_cogs
      }]
    });
  }
  return orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};