import { SalesChannel, ShopifyOrder } from '../types';

export class ShopifyAdapter {
  // Use a CORS proxy because Shopify Admin API doesn't support CORS from browser
  private readonly PROXY_URL = 'https://corsproxy.io/?';

  private getUrl(shopUrl: string, endpoint: string): string {
    // 1. Remove protocol and trailing slashes
    let cleanUrl = shopUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
    
    // 2. Defensive: If user entered just "my-brand" instead of "my-brand.myshopify.com"
    if (!cleanUrl.includes('.')) {
        cleanUrl += '.myshopify.com';
    }

    const fullUrl = `https://${cleanUrl}/admin/api/2024-01/${endpoint}`;
    return `${this.PROXY_URL}${encodeURIComponent(fullUrl)}`;
  }

  async fetchOrders(config: SalesChannel): Promise<ShopifyOrder[]> {
    if (!config.store_url || !config.access_token) return [];
    
    // Clean the token to prevent 401s from copy-paste whitespace
    const accessToken = config.access_token.trim();
    
    // Simulation Mode
    if (accessToken.startsWith('demo_')) {
        return this.getMockOrders();
    }

    try {
      // Fetch last 60 days of orders
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
      
      const endpoint = `orders.json?status=any&limit=250&created_at_min=${twoMonthsAgo.toISOString()}&fields=id,name,created_at,financial_status,fulfillment_status,cancel_reason,total_price,line_items,customer`;
      
      const response = await fetch(this.getUrl(config.store_url, endpoint), {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
          // Log detailed error for debugging
          const text = await response.text();
          console.error(`Shopify API Error (${response.status}): ${text}`);
          throw new Error(`Shopify API Error: ${response.status}`);
      }
      
      const json = await response.json();
      return json.orders || [];

    } catch (e) {
      console.error("Shopify Fetch Failed", e);
      // Return empty array to prevent app crash, error is logged
      return [];
    }
  }

  private getMockOrders(): ShopifyOrder[] {
      const orders: ShopifyOrder[] = [];
      const now = new Date();
      
      for(let i=0; i<50; i++) {
          const date = new Date();
          date.setDate(now.getDate() - Math.floor(Math.random() * 30));
          
          const isCancelled = Math.random() > 0.9;
          const isUnfulfilled = !isCancelled && Math.random() > 0.8;
          
          orders.push({
              id: 10000 + i,
              name: `#${1000 + i}`,
              created_at: date.toISOString(),
              financial_status: 'pending',
              fulfillment_status: isCancelled ? null : (isUnfulfilled ? null : 'fulfilled'),
              cancel_reason: isCancelled ? 'customer' : null,
              total_price: '3500.00',
              line_items: [{
                  id: 999000 + i,
                  title: 'Wireless Earbuds Pro',
                  quantity: 1,
                  sku: 'AUDIO-001',
                  price: '3500.00',
                  variant_id: 123,
                  product_id: 456
              }]
          });
      }
      return orders;
  }
}