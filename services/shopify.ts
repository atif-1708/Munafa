
import { SalesChannel, ShopifyOrder } from '../types';

export class ShopifyAdapter {
  
  /**
   * Fetches orders from the last 120 days.
   * Handles pagination automatically to retrieve all records (beyond the 250 limit).
   */
  async fetchOrders(config: SalesChannel): Promise<ShopifyOrder[]> {
    if (!config.store_url || !config.access_token) return [];
    
    const accessToken = config.access_token.trim();
    if (accessToken.startsWith('demo_')) return this.getMockOrders();

    const domain = this.cleanShopUrl(config.store_url);
    
    // We fetch the last 120 days of orders to cover a wider range of unmapped items
    const historyWindow = new Date();
    historyWindow.setDate(historyWindow.getDate() - 120);
    
    // Added 'fulfillments' to fields
    const fields = "id,name,created_at,financial_status,fulfillment_status,cancel_reason,total_price,line_items,customer,fulfillments";
    let nextUrl = `https://${domain}/admin/api/2023-10/orders.json?status=any&limit=250&created_at_min=${historyWindow.toISOString()}&fields=${fields}`;

    let allOrders: ShopifyOrder[] = [];
    let hasNext = true;

    try {
        while (hasNext) {
            const { json, linkHeader } = await this.fetchWithProxy(nextUrl, accessToken);
            
            if (json && Array.isArray(json.orders)) {
                allOrders = [...allOrders, ...json.orders];
            } else if (json && json.errors) {
                console.error("Shopify API Error:", json.errors);
                throw new Error("Shopify Refused: " + JSON.stringify(json.errors));
            }

            // Handle Pagination
            const nextLink = this.parseNextLink(linkHeader);
            if (nextLink) {
                nextUrl = nextLink;
            } else {
                hasNext = false;
            }
        }
        
        return allOrders;

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
          const { json } = await this.fetchWithProxy(url, config.access_token);
          if (json && json.shop) {
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

  private parseNextLink(linkHeader: string | null): string | null {
      if (!linkHeader) return null;
      // Link header format: <https://...>; rel="next", <https://...>; rel="previous"
      const parts = linkHeader.split(',');
      const nextPart = parts.find(p => p.includes('rel="next"'));
      if (!nextPart) return null;
      const match = nextPart.match(/<([^>]+)>/);
      return match ? match[1] : null;
  }

  private async fetchWithProxy(targetUrl: string, token: string): Promise<{ json: any, linkHeader: string | null }> {
      // List of proxies to try in order. 
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

              const contentType = res.headers.get('content-type');
              const isJson = contentType && contentType.includes('application/json');
              
              if (!isJson) {
                  if (!res.ok) throw new Error(`Proxy Error: ${res.status}`);
                  throw new Error("Received HTML instead of JSON");
              }

              const text = await res.text();
              const linkHeader = res.headers.get('Link') || res.headers.get('link');
              
              if (!res.ok) {
                  if (res.status === 401) throw new Error(`Invalid Access Token for ${targetUrl}. Please check credentials.`);
                  if (res.status === 404) throw new Error(`Store URL not found (${targetUrl}). Check shop name.`);
                  throw new Error(`API ${res.status}: ${text}`);
              }

              try {
                  return { json: JSON.parse(text), linkHeader };
              } catch {
                  throw new Error("Invalid JSON response from Proxy");
              }

          } catch (e: any) {
              lastError = e;
              if (e.message.includes("Invalid Access Token") || e.message.includes("Store URL")) {
                  throw e;
              }
              console.warn(`Proxy failed (${proxyUrl}):`, e.message);
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
              }],
              fulfillments: []
          });
      }
      return orders;
  }
}
