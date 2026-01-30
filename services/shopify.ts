
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
    if (!cleanUrl.includes('.')) cleanUrl += '.myshopify.com';

    let allOrders: ShopifyOrder[] = [];
    let sinceId = 0;
    let hasMore = true;

    // Pagination Loop: Fetch until no more pages
    while (hasMore) {
        // Use 'since_id' for pagination (Standard Shopify REST pattern for efficient traversal)
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
            
            const batch = data.orders || [];
            
            if (batch.length > 0) {
                allOrders = [...allOrders, ...batch];
                // Update cursor to the ID of the last item fetched
                sinceId = batch[batch.length - 1].id;
            }

            // If we got fewer than the limit, we've reached the end
            if (batch.length < 250) {
                hasMore = false;
            }
            
            // Safety break for massive stores (optional cap at e.g., 50k orders if needed, but 2 months is usually safe)
            if (allOrders.length > 20000) { 
                console.warn("Hit safety limit of 20,000 orders for sync.");
                hasMore = false; 
            }

        } catch (e) {
            console.error("Shopify sync error on page:", e);
            // If it's a critical auth error, stop. Otherwise, maybe just this page failed.
            if ((e as Error).message.includes('Auth Failed')) {
                throw e; // Stop the whole sync
            }
            hasMore = false; // Stop syncing on unknown error to prevent infinite loops
        }
    }

    return allOrders;
  }
  
  // Verify credentials by fetching shop details
  async testConnection(config: SalesChannel): Promise<boolean> {
      if (!config.store_url || !config.access_token) return false;
      
      const accessToken = config.access_token.trim();
      if (accessToken.startsWith('demo_')) return true;

      let cleanUrl = config.store_url.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
      if (!cleanUrl.includes('.')) cleanUrl += '.myshopify.com';

      const targetUrl = `https://${cleanUrl}/admin/api/2024-01/shop.json`;

      try {
          const data = await this.fetchWithProxy(targetUrl, {
              method: 'GET',
              headers: {
                  'X-Shopify-Access-Token': accessToken,
                  'Content-Type': 'application/json',
              }
          });
          return !!data.shop;
      } catch (e) {
          console.error("Shopify Connection Test Failed:", e);
          return false;
      }
  }

  // Robust Fetcher with Vercel API support
  private async fetchWithProxy(targetUrl: string, options: RequestInit): Promise<any> {
      // 1. Try Local API (Best for Vercel Production)
      try {
          const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
          const res = await fetch(proxyUrl, options);
          if (res.ok) {
              const contentType = res.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                  return await res.json();
              }
          }
      } catch (e) {
          // Ignore local api error and fall back
      }

      // 2. Fallback: Public Proxies
      // PRIORITIZE CORSPROXY.IO - It preserves headers best.
      const proxies = [
        { base: 'https://corsproxy.io/?', encode: true },
        { base: 'https://api.codetabs.com/v1/proxy?quest=', encode: true },
        { base: 'https://thingproxy.freeboard.io/fetch/', encode: false },
      ];

      let authError: Error | null = null;
      let networkError: Error | null = null;

      for (const proxy of proxies) {
          try {
              const fetchUrl = proxy.encode ? `${proxy.base}${encodeURIComponent(targetUrl)}` : `${proxy.base}${targetUrl}`;

              const res = await fetch(fetchUrl, {
                  ...options,
                  credentials: 'omit' // Prevent cookies to avoid CORS issues
              });
              
              if (!res.ok) {
                  // If 401/403, it MIGHT be the proxy stripping headers. 
                  // Store error and Try Next Proxy.
                  if (res.status === 401 || res.status === 403) {
                      const text = await res.text();
                      // Only treat as definitive if the error body confirms it's from Shopify (JSON)
                      // otherwise it might be the proxy blocking us.
                      let isShopifyError = false;
                      try {
                          const json = JSON.parse(text);
                          if (json.errors) isShopifyError = true;
                      } catch {}

                      const msg = `Shopify Auth Failed (${res.status}): ${text}`;
                      
                      // If we are sure it hit Shopify (isShopifyError), we *could* stop, but 
                      // sometimes proxies mess up requests leading to auth errors. 
                      // Safer to try all proxies if one fails.
                      authError = new Error(msg);
                      continue; 
                  }
                  // For 500s or other errors, continue to next proxy
                  networkError = new Error(`Proxy Error ${res.status}: ${res.statusText}`);
                  continue; 
              }

              const text = await res.text();
              try {
                  return JSON.parse(text);
              } catch {
                  // Not JSON? Proxy returned HTML error page. Try next.
                  continue;
              }
          } catch (e: any) {
              networkError = e;
              // Network error, try next proxy
          }
      }

      // If we exhausted all proxies:
      // If we encountered an Auth error (401), throw that (it's the most specific/likely root cause)
      if (authError) throw authError;
      
      // Otherwise throw generic connectivity error
      throw networkError || new Error("Unable to connect to Shopify. Please check your Store URL and Internet Connection.");
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
