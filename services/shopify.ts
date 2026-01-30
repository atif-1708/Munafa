
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
            if ((e as Error).message.includes('Auth Failed') || (e as Error).message.includes('Access denied')) {
                throw e; // Stop the whole sync
            }
            hasMore = false; // Stop syncing on unknown error to prevent infinite loops
        }
    }

    return allOrders;
  }
  
  // Verify credentials AND permissions by fetching one order
  async testConnection(config: SalesChannel): Promise<boolean> {
      if (!config.store_url || !config.access_token) return false;
      
      const accessToken = config.access_token.trim();
      if (accessToken.startsWith('demo_')) return true;

      let cleanUrl = config.store_url.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
      if (!cleanUrl.includes('.')) cleanUrl += '.myshopify.com';

      // CHANGE: Fetch orders.json (limit=1) instead of shop.json.
      // shop.json is public/readable with almost any scope.
      // orders.json requires 'read_orders', which is what we actually need.
      const targetUrl = `https://${cleanUrl}/admin/api/2024-01/orders.json?limit=1&fields=id`;

      try {
          const data = await this.fetchWithProxy(targetUrl, {
              method: 'GET',
              headers: {
                  'X-Shopify-Access-Token': accessToken,
                  'Content-Type': 'application/json',
              }
          });
          // If we get here and have 'orders' array, it works.
          return Array.isArray(data.orders);
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
                  const json = await res.json();
                  if (json.errors) throw new Error("API Error: " + JSON.stringify(json.errors));
                  return json;
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
                      const msg = `Shopify Auth Failed (${res.status}): ${text}`;
                      authError = new Error(msg);
                      continue; 
                  }
                  // For 500s or other errors, continue to next proxy
                  networkError = new Error(`Proxy Error ${res.status}: ${res.statusText}`);
                  continue; 
              }

              const text = await res.text();
              try {
                  const json = JSON.parse(text);
                  // Critical: Shopify might return 200 but with { "errors": "..." } in body
                  if (json.errors) {
                      const errStr = typeof json.errors === 'string' ? json.errors : JSON.stringify(json.errors);
                      if (errStr.includes('scope') || errStr.includes('permission') || errStr.includes('access')) {
                          authError = new Error(`Shopify Permissions Error: ${errStr}`);
                          // If it's a permission error, no need to retry proxies, the token is the issue.
                          throw authError; 
                      }
                      throw new Error(`Shopify API Error: ${errStr}`);
                  }
                  return json;
              } catch (e: any) {
                  // If we manually threw auth error above, rethrow it
                  if (e.message.includes('Permissions Error')) throw e;
                  // Otherwise, invalid JSON
                  continue;
              }
          } catch (e: any) {
              if (e.message && e.message.includes('Permissions Error')) {
                  authError = e;
                  break; // Stop trying proxies if we know it's a permission issue
              }
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
