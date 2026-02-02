
import { CourierAdapter } from './adapter';
import { IntegrationConfig, TrackingUpdate, OrderStatus, Order, CourierName, PaymentStatus } from '../../types';

export class TcsAdapter implements CourierAdapter {
  name = CourierName.TCS;
  
  // TCS has multiple endpoints depending on the account type (Corporate vs SME vs OCI)
  // We prioritize OCI (ociconnect) as it is the modern standard.
  private readonly BASE_URLS = [
      'https://ociconnect.tcscourier.com',
      'https://api.tcscourier.com',
      'https://apis.tcscourier.com'
  ];

  private async fetchWithFallback(url: string, options: RequestInit): Promise<any> {
    let lastError: Error | null = null;

    // 1. Try Local Proxy first (Highest Priority)
    try {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
        // Pass headers specifically for the proxy to forward
        const headers = { ...options.headers } as Record<string, string>;
        
        const res = await fetch(proxyUrl, { 
            ...options,
            headers: headers 
        });
        
        const contentType = res.headers.get('content-type');
        const text = await res.text();

        // If success
        if (res.ok) {
             try { return JSON.parse(text); } catch { return text; }
        }
        
        // Return explicit API errors
        if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 500 || res.status === 402) {
             // 402 Payment Required is often used by TCS for "Invalid API Key" or "Account Suspended"
             throw new Error(`${res.status} TCS Error: ${text.substring(0, 200)}`);
        }
    } catch (e: any) {
        // If it's a specific API error, stop.
        if (e.message.includes('TCS Error')) throw e;
        console.warn("Local proxy failed, trying public fallbacks...", e);
    }

    // 2. Public Proxies (Fallback)
    const proxies = [
        { base: 'https://api.allorigins.win/raw?url=', encode: true },
        { base: 'https://corsproxy.io/?', encode: true },
    ];

    for (const proxy of proxies) {
        try {
            const fetchUrl = proxy.encode ? `${proxy.base}${encodeURIComponent(url)}` : `${proxy.base}${url}`;
            const response = await fetch(fetchUrl, { ...options, credentials: 'omit' });
            
            const text = await response.text();
            
            if (!response.ok) {
                 if (text.includes("Free usage is limited") || text.includes("Access Denied")) continue;
                 
                 throw new Error(`${response.status} TCS Error: ${text.substring(0, 100)}`);
            }
            
            try { return JSON.parse(text); } catch { return text; }

        } catch (e: any) {
            lastError = e;
            if (e.message.includes('TCS Error')) throw e;
        }
    }
    
    throw lastError || new Error("Network Error: Could not connect to TCS via any proxy path.");
  }

  // Method 1: Authorization API (Client ID / Secret) - GET
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

      // If we get here, the response format wasn't what we expected for a success
      throw new Error(`Invalid GET Response format`);
  }

  // Method 2: Authorization API (Client ID / Secret) - POST (Standard for OCI)
  private async getTokenByClientIdPost(baseUrl: string, clientId: string, clientSecret: string): Promise<string> {
      // Try /auth/v2/token (Standard OCI)
      const url = `${baseUrl}/auth/v2/token`;
      
      // Note: OCI often requires application/json body
      const response = await this.fetchWithFallback(url, { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              client_id: clientId,
              client_secret: clientSecret
          })
      });
      
      if (response?.access_token) return response.access_token;
      if (response?.data?.access_token) return response.data.access_token;
      
      // NEW: Return exact error from TCS if available
      const errorMsg = typeof response === 'object' ? JSON.stringify(response) : String(response).substring(0, 200);
      throw new Error(`Invalid POST Response: ${errorMsg}`);
  }

  // Method 3: Authentication API (Username / Password)
  private async getTokenByCredentials(baseUrl: string, username: string, password: string): Promise<string> {
      const url = `${baseUrl}/ecom/api/authentication/token?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
      const response = await this.fetchWithFallback(url, { method: 'GET' });
      
      if (response?.accesstoken) return response.accesstoken;
      if (response?.access_token) return response.access_token;
      if (response?.result?.accesstoken) return response.result.accesstoken;

      throw new Error(`Invalid User/Pass Response format`);
  }

  // Main Token Handler
  private async getToken(config: IntegrationConfig): Promise<string> {
      const u = config.username;
      const p = config.password;
      const explicitToken = config.api_token;

      if (p && p.length > 100) return p; 
      if (explicitToken && explicitToken.length > 100) return explicitToken;

      if (!u || !p) throw new Error("Missing TCS Credentials (Username/Password)");

      let detailedErrors = "";

      for (const baseUrl of this.BASE_URLS) {
          // 1. Try POST (Most robust for modern TCS)
          try {
              return await this.getTokenByClientIdPost(baseUrl, u, p);
          } catch (e: any) {
              detailedErrors += `[${baseUrl} POST]: ${e.message}\n`;
          }

          // 2. Try GET (Legacy)
          try {
              return await this.getTokenByClientId(baseUrl, u, p);
          } catch (e: any) {
              detailedErrors += `[${baseUrl} GET]: ${e.message}\n`;
          }

          // 3. Try User/Pass (Very Old)
          try {
              return await this.getTokenByCredentials(baseUrl, u, p);
          } catch (e: any) {
              detailedErrors += `[${baseUrl} UserPass]: ${e.message}\n`;
          }
      }

      console.error("TCS Auth Errors:\n", detailedErrors);
      throw new Error(`TCS Connection Failed. Please verify your Client ID and Secret.\n\nDetails:\n${detailedErrors}`);
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
              // Try Standard Ecom API
              let url = `${baseUrl}/ecom/api/Payment/detail?accesstoken=${encodeURIComponent(token)}&customerno=${costCenter}&fromdate=${fromParams}&todate=${toParams}`;
              response = await this.fetchWithFallback(url, { method: 'GET' });
              
              if (!response || !response.detail) {
                   // Try V2 API (OCI)
                   url = `${baseUrl}/cod/api/v2/cod-details?accesstoken=${encodeURIComponent(token)}&costCenterCode=${costCenter}&startDate=${fromParams}&endDate=${toParams}`;
                   response = await this.fetchWithFallback(url, { method: 'GET' });
              }

              if (response && (response.detail || Array.isArray(response.data))) break;
          } catch(e) {}
      }

      let ordersList = [];
      if (response?.detail) ordersList = response.detail;
      else if (response?.data) ordersList = response.data;
      
      if (!ordersList || !Array.isArray(ordersList)) {
          return [];
      }

      return ordersList.map((tcsOrder: any) => {
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
