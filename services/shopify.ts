
import { SalesChannel, ShopifyOrder } from '../types';

export class ShopifyAdapter {
  async fetchOrders(config: SalesChannel): Promise<ShopifyOrder[]> {
    if (!config.store_url || !config.access_token) return [];
    
    const accessToken = config.access_token.trim();
    
    // Simulation Mode
    if (accessToken.startsWith('demo_')) {
        return this.getMockOrders();
    }

    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
    
    let cleanUrl = config.store_url.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
    if (cleanUrl.includes('/')) cleanUrl = cleanUrl.split('/')[0];
    if (!cleanUrl.includes('.')) cleanUrl += '.myshopify.com';

    let allOrders: ShopifyOrder[] = [];
    let sinceId = 0;
    let hasMore = true;

    // Pagination Loop: Fetch until no more pages
    while (hasMore) {
        const endpoint = `orders.json?status=any&limit=250&created_at_min=${twoMonthsAgo.toISOString()}&since_id=${sinceId}&fields=id,name,created_at,financial_status,fulfillment_status,cancel_reason,total_price,line_items,customer`;
        const targetUrl = `https://${cleanUrl}/admin/api/2024-01/${endpoint}`;

        try {
            const data = await this.fetchWithProxy(targetUrl, {
                method: 'GET',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json',
                }
            });
            
            // Check for explicit Shopify errors in body (200 OK but error body)
            if (data.errors) {
                 throw new Error(JSON.stringify(data.errors));
            }

            const batch = data.orders || [];
            
            if (batch.length > 0) {
                allOrders = [...allOrders, ...batch];
                sinceId = batch[batch.length - 1].id;
            }

            if (batch.length < 250) {
                hasMore = false;
            }
            
            if (allOrders.length > 20000) { 
                console.warn("Hit safety limit of 20,000 orders for sync.");
                hasMore = false; 
            }

        } catch (e: any) {
            console.error("Shopify sync error on page:", e);
            // If it's a critical auth error, stop.
            if (e.message.includes('Invalid API key') || e.message.includes('access token') || e.message.includes('401')) {
                throw new Error("Shopify Auth Failed. Please check your Access Token and Permissions.");
            }
            // For other errors (like network), stop pagination but return what we have
            hasMore = false; 
        }
    }

    return allOrders;
  }
  
  async testConnection(config: SalesChannel): Promise<boolean> {
      if (!config.store_url || !config.access_token) return false;
      
      const accessToken = config.access_token.trim();
      if (accessToken.startsWith('demo_')) return true;

      let cleanUrl = config.store_url.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
      if (cleanUrl.includes('/')) cleanUrl = cleanUrl.split('/')[0];
      if (!cleanUrl.includes('.')) cleanUrl += '.myshopify.com';

      // Use orders.json to verify read_orders scope. 
      // This is the specific permission we need.
      const targetUrl = `https://${cleanUrl}/admin/api/2024-01/orders.json?limit=1&fields=id`;

      try {
          const data = await this.fetchWithProxy(targetUrl, {
              method: 'GET',
              headers: {
                  'X-Shopify-Access-Token': accessToken,
                  'Content-Type': 'application/json',
              }
          });
          
          if (data.errors) {
              console.error("Shopify Test Error Body:", data.errors);
              return false;
          }
          
          // Successful response MUST contain "orders" array (even if empty)
          return Array.isArray(data.orders);
      } catch (e) {
          console.error("Shopify Connection Test Failed:", e);
          return false;
      }
  }

  // Robust Fetcher
  private async fetchWithProxy(targetUrl: string, options: RequestInit): Promise<any> {
      // 1. Try Local API (Vercel/Next/Custom Server)
      try {
          const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
          const res = await fetch(proxyUrl, options);
          if (res.ok) {
              const contentType = res.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                  return await res.json();
              }
          }
      } catch (e) {}

      // 2. Fallback: Public Proxies
      // IMPORTANT: corsproxy.io works but can be flaky. Added allorigins as fallback for GET requests.
      const proxies = [
        { base: 'https://corsproxy.io/?', encode: true },
        { base: 'https://thingproxy.freeboard.io/fetch/', encode: false },
        { base: 'https://api.allorigins.win/raw?url=', encode: true }, // Good for GET, strips headers sometimes
      ];

      let lastError: Error | null = null;

      for (const proxy of proxies) {
          try {
              // Note: allorigins only supports GET effectively for this use case.
              if (proxy.base.includes('allorigins') && options.method !== 'GET') continue;

              const fetchUrl = proxy.encode ? `${proxy.base}${encodeURIComponent(targetUrl)}` : `${proxy.base}${targetUrl}`;

              const res = await fetch(fetchUrl, {
                  ...options,
                  credentials: 'omit'
              });
              
              const text = await res.text();

              // Handle HTTP Errors
              if (!res.ok) {
                  // If 401/403, it might be the proxy stripping headers OR actual auth failure.
                  // We try the next proxy just in case.
                  if (res.status === 401 || res.status === 403) {
                       lastError = new Error(`Auth Failed (${res.status}): ${text}`);
                       continue;
                  }
                  
                  // Other errors (500, 404, etc)
                  lastError = new Error(`Proxy Error ${res.status}: ${text}`);
                  continue; 
              }

              // Try parsing JSON
              try {
                  return JSON.parse(text);
              } catch {
                  // If not JSON, it might be a proxy error page
                  lastError = new Error("Invalid JSON response from proxy");
                  continue;
              }

          } catch (e: any) {
              lastError = e;
          }
      }

      // If we are here, all proxies failed.
      throw lastError || new Error("Unable to connect to Shopify. Please check your internet connection.");
  }

  private getMockOrders(): ShopifyOrder[] {
      // ... (Keep existing mock data)
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
                  id: 999000 + i, title: 'Wireless Earbuds Pro', quantity: 1, sku: 'AUDIO-001', price: '3500.00', variant_id: 123, product_id: 456
              }]
          });
      }
      return orders;
  }
}
