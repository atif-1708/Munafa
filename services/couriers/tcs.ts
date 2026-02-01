
import { CourierAdapter } from './adapter';
import { IntegrationConfig, TrackingUpdate, OrderStatus, Order, CourierName, PaymentStatus } from '../../types';

export class TcsAdapter implements CourierAdapter {
  name = CourierName.TCS;
  
  // TCS has multiple endpoints depending on the account type (Corporate vs SME vs OCI)
  private readonly BASE_URLS = [
      'https://ociconnect.tcscourier.com',
      'https://api.tcscourier.com',
      'https://apis.tcscourier.com'
  ];

  private async fetchWithFallback(url: string, options: RequestInit): Promise<any> {
    let lastError: Error | null = null;

    // 1. Try Local Proxy first (Highest Priority & Most Accurate Error Reporting)
    try {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl, options);
        
        const contentType = res.headers.get('content-type');
        const text = await res.text();

        // If success
        if (res.ok) {
             try { return JSON.parse(text); } catch { return text; }
        }
        
        // CRITICAL: If Local Proxy returns a specific API error (401/403/500) from TCS,
        // we must report THIS error. Do not fallback to public proxies, as they cannot fix invalid credentials.
        if (res.status === 401 || res.status === 403 || res.status === 500) {
             // Exception: If it looks like an HTML error page from Vercel/Hosting (e.g. 504 Gateway Timeout), we can try fallback.
             if (contentType && contentType.includes('text/html')) {
                 // Log warning but allow fallback
                 console.warn("Local proxy infrastructure error, trying fallbacks...");
             } else {
                 // This is a real API error (e.g. Invalid Password). Throw it.
                 throw new Error(`${res.status} ${res.statusText}: ${text.substring(0, 200)}`);
             }
        }
    } catch (e: any) {
        // Only allow fallback if it was a network error or generic proxy infrastructure error
        // If we explicitly threw a TCS Error above, re-throw it.
        if (e.message.includes('401') || e.message.includes('403') || e.message.includes('500 TCS')) throw e;
        
        console.warn("Local proxy failed, trying public fallbacks...", e);
    }

    // 2. Public Proxies (Fallback)
    // Note: 'allorigins' is often more reliable for production domains than 'corsproxy' free tier.
    const proxies = [
        { base: 'https://api.allorigins.win/raw?url=', encode: true },
        { base: 'https://corsproxy.io/?', encode: true },
        { base: 'https://thingproxy.freeboard.io/fetch/', encode: false },
    ];

    let lastResponseText = "";

    for (const proxy of proxies) {
        try {
            const fetchUrl = proxy.encode ? `${proxy.base}${encodeURIComponent(url)}` : `${proxy.base}${url}`;
            const response = await fetch(fetchUrl, { ...options, credentials: 'omit' });
            
            const text = await response.text();
            lastResponseText = text;
            
            if (!response.ok) {
                 // Detect specific proxy limitations to provide better error messages
                 if (text.includes("Free usage is limited") || text.includes("Access Denied")) {
                     lastError = new Error(`Proxy Blocked: ${proxy.base} refused connection. Code: ${response.status}`);
                     continue; 
                 }
                 
                 if (response.status === 401) throw new Error("401 Unauthorized - Check Credentials");
                 if (response.status === 403) throw new Error("403 Forbidden - Access Denied");
                 if (response.status === 500) throw new Error("500 TCS Server Error");
                 if (response.status === 404) throw new Error("404 Endpoint Not Found");
                 
                 throw new Error(`API Error ${response.status}`);
            }
            
            try { return JSON.parse(text); } catch { return text; }

        } catch (e: any) {
            console.warn(`TCS fetch failed via proxy`, e.message);
            lastError = e;
            
            // If it was a credential error (401/403) from the destination, stop trying other proxies.
            if (e.message.includes("401") || e.message.includes("403")) {
                throw new Error(`${e.message} | Response: ${lastResponseText.substring(0, 50)}`);
            }
        }
    }
    
    throw lastError || new Error("Network Error: Could not connect to TCS via any proxy path.");
  }

  // Method 1: Authorization API (Client ID / Secret)
  private async getTokenByClientId(baseUrl: string, clientId: string, clientSecret: string): Promise<string> {
      const url = `${baseUrl}/auth/api/auth?clientid=${clientId}&clientsecret=${clientSecret}`;
      const response = await this.fetchWithFallback(url, { method: 'GET' });
      
      if (response?.result?.accessToken) return response.result.accessToken;
      if (response?.result?.accesstoken) return response.result.accesstoken;
      if (response?.accessToken) return response.accessToken;
      if (response?.access_token) return response.access_token;
      
      if (typeof response === 'string' && response.length > 20 && !response.includes('{')) {
          return response;
      }

      throw new Error(`Invalid Response: ${JSON.stringify(response).substring(0, 100)}`);
  }

  // Method 2: Authentication API (Username / Password)
  private async getTokenByCredentials(baseUrl: string, username: string, password: string): Promise<string> {
      const url = `${baseUrl}/ecom/api/authentication/token?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
      const response = await this.fetchWithFallback(url, { method: 'GET' });
      
      if (response?.accesstoken) return response.accesstoken;
      if (response?.access_token) return response.access_token;
      if (response?.result?.accesstoken) return response.result.accesstoken;

      throw new Error(`Invalid Response: ${JSON.stringify(response).substring(0, 100)}`);
  }

  // Main Token Handler
  private async getToken(config: IntegrationConfig): Promise<string> {
      const u = config.username;
      const p = config.password;
      const explicitToken = config.api_token;

      if (p && p.length > 100) return p; 
      if (explicitToken && explicitToken.length > 100) return explicitToken;

      if (!u || !p) throw new Error("Missing TCS Credentials (Username/Password)");

      let lastError = "";

      for (const baseUrl of this.BASE_URLS) {
          try {
              // 1. Try Client ID / Secret
              return await this.getTokenByClientId(baseUrl, u, p);
          } catch (e: any) {
              lastError += `[${baseUrl} (ClientID)]: ${e.message}\n`;
              
              // 2. Try Username / Password
              try {
                  return await this.getTokenByCredentials(baseUrl, u, p);
              } catch (e2: any) {
                  lastError += `[${baseUrl} (UserPass)]: ${e2.message}\n`;
              }
          }
      }

      console.error("TCS Auth Errors Debug:\n", lastError);
      throw new Error(`TCS Connection Failed. Details:\n${lastError}`);
  }

  private mapStatus(rawStatus: string): OrderStatus {
    const s = rawStatus?.toLowerCase() || '';
    
    if (s.includes('delivered')) return OrderStatus.DELIVERED;
    if (s.includes('return') || s.includes('rto')) return OrderStatus.RETURNED;
    if (s.includes('cancel')) return OrderStatus.CANCELLED;
    if (s.includes('booked')) return OrderStatus.BOOKED;
    
    if (s === 'ok') return OrderStatus.DELIVERED; 
    if (s === 'ro') return OrderStatus.RETURNED;

    return OrderStatus.IN_TRANSIT;
  }

  async track(trackingNumber: string, config: IntegrationConfig): Promise<TrackingUpdate> {
      const token = await this.getToken(config);
      
      for (const baseUrl of this.BASE_URLS) {
          try {
              const url = `${baseUrl}/tracking/api/Tracking/GetDynamicTrackDetail?consignee=${trackingNumber}`;
              const data = await this.fetchWithFallback(url, {
                  method: 'GET',
                  headers: { 'Authorization': `Bearer ${token}` }
              });

              const info = data.shipmentinfo?.[0] || data.deliveryinfo?.[0];
              if (info) {
                  return {
                      tracking_number: trackingNumber,
                      status: this.mapStatus(info.status),
                      raw_status_text: info.status,
                      courier_timestamp: info.datetime || new Date().toISOString()
                  };
              }
          } catch (e) {
              continue;
          }
      }

      throw new Error("Tracking not found on any TCS server");
  }

  async createBooking(order: Order, config: IntegrationConfig): Promise<string> {
      throw new Error("Booking not implemented for TCS yet.");
  }

  async testConnection(config: IntegrationConfig): Promise<boolean> {
      const token = await this.getToken(config);
      return !!token;
  }

  async fetchRecentOrders(config: IntegrationConfig): Promise<Order[]> {
      const token = await this.getToken(config);
      const costCenter = config.merchant_id;

      if (!costCenter) throw new Error("Missing Cost Center Code (Account Number)");

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 60); 
      
      const fromParams = startDate.toISOString().split('T')[0];
      const toParams = endDate.toISOString().split('T')[0];

      let response: any = null;

      for (const baseUrl of this.BASE_URLS) {
          try {
              const url = `${baseUrl}/ecom/api/Payment/detail?accesstoken=${encodeURIComponent(token)}&customerno=${costCenter}&fromdate=${fromParams}&todate=${toParams}`;
              response = await this.fetchWithFallback(url, { method: 'GET' });
              if (response && (response.detail || Array.isArray(response.detail))) break;
          } catch(e) {}
      }

      if (!response || !response.detail || !Array.isArray(response.detail)) {
          return [];
      }

      return response.detail.map((tcsOrder: any) => {
          const rawStatus = tcsOrder.status || tcsOrder['cn status'] || 'Unknown';
          const status = this.mapStatus(rawStatus);
          
          let amount = parseFloat(tcsOrder['amount paid'] || 0);
          if (amount === 0 && tcsOrder['cod amount']) {
              amount = parseFloat(tcsOrder['cod amount']);
          }
          
          const deliveryCharges = parseFloat(tcsOrder['delivery charges'] || 0);
          
          return {
              id: tcsOrder['cn by courier'] || Math.random().toString(),
              shopify_order_number: tcsOrder['order no'] || 'N/A',
              created_at: tcsOrder['booking date'] ? new Date(tcsOrder['booking date']).toISOString() : new Date().toISOString(),
              customer_city: tcsOrder.city || 'Unknown',
              courier: CourierName.TCS,
              tracking_number: tcsOrder['cn by courier'],
              status: status,
              payment_status: tcsOrder['payment status'] === 'Y' ? PaymentStatus.REMITTED : PaymentStatus.UNPAID,
              
              cod_amount: amount, 
              shipping_fee_paid_by_customer: 0,
              
              courier_fee: deliveryCharges > 0 ? deliveryCharges : 250, 
              rto_penalty: status === OrderStatus.RETURNED ? 0 : 0, 
              packaging_cost: 45,
              overhead_cost: 0,
              tax_amount: 0,
              
              items: [{
                  product_id: 'unknown',
                  quantity: 1,
                  sale_price: amount,
                  product_name: 'TCS Shipment',
                  sku: 'TCS-ITEM',
                  variant_fingerprint: 'tcs-item',
                  cogs_at_time_of_order: 0
              }]
          };
      });
  }
}
