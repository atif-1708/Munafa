import { IntegrationConfig, ShopifyOrder } from '../types';

export class ShopifyAdapter {
  // Use a CORS proxy because Shopify Admin API doesn't support CORS from browser
  private readonly PROXY_URL = 'https://corsproxy.io/?';

  private getUrl(shopUrl: string, endpoint: string): string {
    // Ensure shopUrl is clean (e.g. 'mystore.myshopify.com')
    const cleanUrl = shopUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const fullUrl = `https://${cleanUrl}/admin/api/2024-01/${endpoint}`;
    return `${this.PROXY_URL}${encodeURIComponent(fullUrl)}`;
  }

  async testConnection(config: IntegrationConfig): Promise<boolean> {
    if (!config.base_url || !config.api_token) return false;
    // Simulation Mode
    if (config.api_token.startsWith('demo_')) return true;

    try {
      const response = await fetch(this.getUrl(config.base_url, 'shop.json'), {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': config.api_token,
          'Content-Type': 'application/json',
        }
      });
      return response.ok;
    } catch (e) {
      console.error("Shopify Connection Test Failed", e);
      return false;
    }
  }

  async fetchOrders(config: IntegrationConfig): Promise<ShopifyOrder[]> {
    if (!config.base_url || !config.api_token) return [];
    
    // Simulation Mode
    if (config.api_token.startsWith('demo_')) {
        return this.getMockOrders();
    }

    try {
      // Fetch last 60 days of orders, any status (open, closed, cancelled)
      // Limit 250 (max page size)
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
      
      const endpoint = `orders.json?status=any&limit=250&created_at_min=${twoMonthsAgo.toISOString()}&fields=id,name,created_at,financial_status,fulfillment_status,cancel_reason,total_price,line_items,customer`;
      
      const response = await fetch(this.getUrl(config.base_url, endpoint), {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': config.api_token,
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) throw new Error(`Shopify API Error: ${response.status}`);
      
      const json = await response.json();
      return json.orders || [];

    } catch (e) {
      console.error("Shopify Fetch Failed", e);
      return [];
    }
  }

  private getMockOrders(): ShopifyOrder[] {
      // Generate some mock data that intentionally has some discrepancies with the courier mock data
      const orders: ShopifyOrder[] = [];
      const now = new Date();
      
      for(let i=0; i<50; i++) {
          const date = new Date();
          date.setDate(now.getDate() - Math.floor(Math.random() * 30));
          
          const isCancelled = Math.random() > 0.9;
          const isUnfulfilled = !isCancelled && Math.random() > 0.8; // 10% missed orders
          
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