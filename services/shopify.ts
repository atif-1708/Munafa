
import { SalesChannel, ShopifyOrder } from '../types';

export class ShopifyAdapter {
  
  /**
   * Fetches orders from Shopify with pagination.
   * Handles CORS via proxy.
   */
  async fetchOrders(config: SalesChannel): Promise<ShopifyOrder[]> {
    if (!config.store_url || !config.access_token) return [];
    
    const accessToken = config.access_token.trim();
    if (accessToken.startsWith('demo_')) return this.getMockOrders();

    const domain = this.cleanShopUrl(config.store_url);
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
    
    let allOrders: ShopifyOrder[] = [];
    let nextUrl: string | null = `https://${domain}/admin/api/2023-10/orders.json?status=any&limit=250&created_at_min=${twoMonthsAgo.toISOString()}`;

    // Safety limit to prevent infinite loops
    let pages = 0;
    const MAX_PAGES = 20; 

    try {
        while (nextUrl && pages < MAX_PAGES) {
            const data = await this.fetchSafe(nextUrl, accessToken);
            
            if (data.orders) {
                allOrders = [...allOrders, ...data.orders];
                
                // Pagination: Shopify uses Link header usually, but for simple ID-based:
                if (data.orders.length === 250) {
                    const lastId = data.orders[data.orders.length - 1].id;
                    nextUrl = `https://${domain}/admin/api/2023-10/orders.json?status=any&limit=250&created_at_min=${twoMonthsAgo.toISOString()}&since_id=${lastId}`;
                } else {
                    nextUrl = null;
                }
            } else {
                nextUrl = null;
            }
            pages++;
        }
    } catch (e: any) {
        console.error("Shopify Fetch Error:", e);
        throw new Error(e.message || "Failed to sync with Shopify");
    }

    return allOrders;
  }
  
  /**
   * Validates credentials by fetching a single order.
   */
  async testConnection(config: SalesChannel): Promise<{ success: boolean; message?: string }> {
      if (!config.store_url || !config.access_token) {
          return { success: false, message: "Missing URL or Token" };
      }
      
      if (config.access_token.startsWith('demo_')) return { success: true };

      const domain = this.cleanShopUrl(config.store_url);
      const url = `https://${domain}/admin/api/2023-10/orders.json?limit=1&fields=id`;

      try {
          const data = await this.fetchSafe(url, config.access_token);
          if (Array.isArray(data.orders)) {
              return { success: true };
          }
          return { success: false, message: "Invalid response format from Shopify." };
      } catch (e: any) {
          return { success: false, message: e.message };
      }
  }

  // --- Helpers ---

  private cleanShopUrl(url: string): string {
      let clean = url.trim().toLowerCase();
      clean = clean.replace(/^https?:\/\//, '');
      clean = clean.replace(/\/$/, '');
      if (clean.includes('/')) clean = clean.split('/')[0];
      if (!clean.includes('.')) clean += '.myshopify.com';
      return clean;
  }

  private async fetchSafe(targetUrl: string, token: string): Promise<any> {
      // We use corsproxy.io as the primary stable proxy for headers
      const proxyBase = "https://corsproxy.io/?";
      const encodedUrl = encodeURIComponent(targetUrl);
      const fetchUrl = `${proxyBase}${encodedUrl}`;

      const res = await fetch(fetchUrl, {
          method: 'GET',
          headers: {
              'X-Shopify-Access-Token': token,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
          }
      });

      const text = await res.text();

      if (!res.ok) {
          if (res.status === 401) throw new Error("Unauthorized: Invalid API Access Token.");
          if (res.status === 404) throw new Error("Store Not Found: Check your Store URL.");
          if (res.status === 403) throw new Error("Forbidden: Token lacks 'read_orders' permission.");
          throw new Error(`Shopify API Error ${res.status}: ${text}`);
      }

      try {
          return JSON.parse(text);
      } catch {
          throw new Error("Invalid JSON received from Shopify.");
      }
  }

  private getMockOrders(): ShopifyOrder[] {
      const orders: ShopifyOrder[] = [];
      const now = new Date();
      for(let i=0; i<30; i++) {
          const date = new Date();
          date.setDate(now.getDate() - i);
          orders.push({
              id: 1000 + i,
              name: `#${1000 + i}`,
              created_at: date.toISOString(),
              financial_status: i % 3 === 0 ? 'paid' : 'pending',
              fulfillment_status: i % 4 === 0 ? 'fulfilled' : null,
              cancel_reason: i === 5 ? 'customer' : null,
              total_price: '2500.00',
              line_items: [{
                  id: 999000 + i, title: 'Demo Product', quantity: 1, sku: 'DEMO-001', price: '2500.00', variant_id: 1, product_id: 101
              }]
          });
      }
      return orders;
  }
}
