
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
            hasMore = false; // Stop syncing on error to prevent infinite loops
        }
    }

    return allOrders;
  }

  // Robust Fetcher with Vercel API support
  private async fetchWithProxy(targetUrl: string, options: RequestInit): Promise<any> {
      // 1. Try Local API (Best for Vercel Production)
      try {
          // Check if we are in a browser env where /api might exist
          const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
          const res = await fetch(proxyUrl, options);
          if (res.ok) {
              const contentType = res.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                  return await res.json();
              }
              // If text, check if it's valid JSON
              const text = await res.text();
              try { return JSON.parse(text); } catch { /* Not JSON */ }
          }
      } catch (e) {
          // Ignore local api error and fall back
      }

      // 2. Fallback: Public Proxies
      // Order matters: AllOrigins is very reliable for simple GETs
      const proxies = [
          'https://api.allorigins.win/raw?url=',
          'https://corsproxy.io/?', 
          'https://thingproxy.freeboard.io/fetch/',
      ];

      for (const proxyBase of proxies) {
          try {
              let fetchUrl = '';
              // URL Construction Logic
              if (proxyBase.includes('corsproxy.io') || proxyBase.includes('allorigins')) {
                   // These expect encoded URL
                   fetchUrl = `${proxyBase}${encodeURIComponent(targetUrl)}`;
              } else {
                   fetchUrl = `${proxyBase}${targetUrl}`;
              }

              const res = await fetch(fetchUrl, options);
              
              if (!res.ok) {
                  // Specific check: If 401/403, the key/url is definitely wrong, don't retry proxies
                  if (res.status === 401 || res.status === 403) {
                      const text = await res.text();
                      throw new Error(`Shopify Auth Failed (${res.status}): ${text}`);
                  }
                  continue; 
              }

              const contentType = res.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                  return await res.json();
              } else {
                  // Try parsing anyway, sometimes content-type is missing
                  const text = await res.text();
                  try {
                      return JSON.parse(text);
                  } catch {
                      // ignore
                  }
              }
          } catch (e) {
              console.warn(`Proxy ${proxyBase} failed`, e);
          }
      }
      throw new Error("Unable to connect to Shopify. Please check your Store URL and Internet Connection.");
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
