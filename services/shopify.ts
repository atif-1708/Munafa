import { SalesChannel, ShopifyOrder } from '../types';

export class ShopifyAdapter {
  // Primary and Backup Proxies to bypass CORS in browser
  private readonly PROXIES = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url='
  ];

  async fetchOrders(config: SalesChannel): Promise<ShopifyOrder[]> {
    if (!config.store_url || !config.access_token) return [];
    
    // Clean the token to prevent 401s from copy-paste whitespace
    const accessToken = config.access_token.trim();
    
    // Simulation Mode
    if (accessToken.startsWith('demo_')) {
        return this.getMockOrders();
    }

    // Fetch last 60 days of orders
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);
    
    // Clean URL generation
    let cleanUrl = config.store_url.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
    if (!cleanUrl.includes('.')) cleanUrl += '.myshopify.com';

    const endpoint = `orders.json?status=any&limit=250&created_at_min=${twoMonthsAgo.toISOString()}&fields=id,name,created_at,financial_status,fulfillment_status,cancel_reason,total_price,line_items,customer`;
    const targetUrl = `https://${cleanUrl}/admin/api/2024-01/${endpoint}`;
    const encodedTarget = encodeURIComponent(targetUrl);

    let lastError;

    // Try Proxies in Sequence
    for (const proxyBase of this.PROXIES) {
        try {
            // Construct Proxy URL
            let fetchUrl = `${proxyBase}${encodedTarget}`;
            
            // Add cache buster for allorigins to prevent stale data
            if (proxyBase.includes('allorigins')) {
                fetchUrl += `&timestamp=${Date.now()}`;
            }

            const response = await fetch(fetchUrl, {
                method: 'GET',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                const text = await response.text();
                // If 401/403 (Auth Error), stop trying other proxies as the key is wrong.
                if (response.status === 401 || response.status === 403) {
                     console.error(`Shopify Auth Error: ${text}`);
                     return []; 
                }
                throw new Error(`Status ${response.status}`);
            }
            
            const json = await response.json();
            return json.orders || [];

        } catch (e: any) {
            console.warn(`Shopify fetch failed via ${proxyBase}`, e);
            lastError = e;
            // Continue to next proxy in loop
        }
    }

    console.error("All Shopify fetch attempts failed.", lastError);
    return [];
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
