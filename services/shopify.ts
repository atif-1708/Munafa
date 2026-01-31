
import { SalesChannel, ShopifyOrder } from '../types';

export class ShopifyAdapter {
  
  /**
   * Fetches the last 250 orders from Shopify.
   * Uses a robust proxy system with fallbacks to bypass CORS restrictions.
   */
  async fetchOrders(config: SalesChannel): Promise<ShopifyOrder[]> {
    if (!config.store_url || !config.access_token) return [];
    
    const accessToken = config.access_token.trim();
    if (accessToken.startsWith('demo_')) return this.getMockOrders();

    const domain = this.cleanShopUrl(config.store_url);
    
    // We fetch the last 60 days of orders
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
    
    // Simplified Endpoint: Get raw JSON with specific fields to reduce payload size
    const fields = "id,name,created_at,financial_status,fulfillment_status,cancel_reason,total_price,line_items,customer";
    const endpoint = `orders.json?status=any&limit=250&created_at_min=${twoMonthsAgo.toISOString()}&fields=${fields}`;
    const targetUrl = `https://${domain}/admin/api/2023-10/${endpoint}`;

    try {
        const data = await this.fetchWithProxy(targetUrl, accessToken);
        
        if (data && Array.isArray(data.orders)) {
            return data.orders;
        } else if (data && data.errors) {
            console.error("Shopify API Error:", data.errors);
            throw new Error("Shopify Refused: " + JSON.stringify(data.errors));
        }
        
        return [];
    } catch (e: any) {
        console.error("Shopify Sync Failed:", e);
        throw new Error(e.message || "Failed to connect to Shopify");
    }
  }
  
  /**
   * Simple connection test
   */
  async testConnection(config: SalesChannel): Promise<{ success: boolean; message?: string }> {
      if (!config.store_url || !config.access_token) {
          return { success: false, message: "Missing URL or Token" };
      }
      
      if (config.access_token.startsWith('demo_')) return { success: true };

      const domain = this.cleanShopUrl(config.store_url);
      const url = `https://${domain}/admin/api/2023-10/shop.json`; // Lightweight endpoint

      try {
          const data = await this.fetchWithProxy(url, config.access_token);
          if (data && data.shop) {
              return { success: true };
          }
          return { success: false, message: "Invalid response from Shopify. Ensure token has 'read_products' or 'read_orders' scope." };
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

  private async fetchWithProxy(targetUrl: string, token: string): Promise<any> {
      // List of proxies to try in order. 
      // 1. Local API (Best for Production/Vercel)
      // 2. corsproxy.io (Fast Public Proxy)
      // 3. thingproxy (Backup Public Proxy)
      const proxies = [
          `/api/proxy?url=${encodeURIComponent(targetUrl)}`,
          `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
          `https://thingproxy.freeboard.io/fetch/${targetUrl}`
      ];

      let lastError: Error | null = null;

      for (const proxyUrl of proxies) {
          try {
              const res = await fetch(proxyUrl, {
                  method: 'GET',
                  headers: {
                      'X-Shopify-Access-Token': token,
                      'Content-Type': 'application/json',
                      'User-Agent': 'MunafaBakhsh-App/1.0'
                  }
              });

              // Handle HTML errors (like 404 from SPA routing or Proxy error pages)
              const contentType = res.headers.get('content-type');
              const isJson = contentType && contentType.includes('application/json');
              
              if (!isJson) {
                  // If we got HTML (e.g. Vercel 404), treat as network failure and try next proxy
                  if (!res.ok) throw new Error(`Proxy Error: ${res.status}`);
                  // If 200 OK but HTML, it's likely a SPA fallback, ignore.
                  throw new Error("Received HTML instead of JSON");
              }

              const text = await res.text();
              
              if (!res.ok) {
                  // If it's a 401, it's definitely an auth error, don't retry other proxies
                  if (res.status === 401) throw new Error(`Invalid Access Token for ${targetUrl}. Please check credentials.`);
                  if (res.status === 404) throw new Error(`Store URL not found (${targetUrl}). Check shop name.`);
                  
                  // For 500s or 403s (often proxy issues), we throw to catch block to try next proxy
                  throw new Error(`API ${res.status}: ${text}`);
              }

              try {
                  return JSON.parse(text);
              } catch {
                  throw new Error("Invalid JSON response from Proxy");
              }

          } catch (e: any) {
              lastError = e;
              // If it's an Auth error, stop retrying immediately
              if (e.message.includes("Invalid Access Token") || e.message.includes("Store URL")) {
                  throw e;
              }
              console.warn(`Proxy failed (${proxyUrl}):`, e.message);
              // Continue to next proxy
          }
      }

      throw lastError || new Error("Network Error: Could not connect to Shopify via any proxy.");
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
