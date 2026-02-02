
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

    // 1. Try Local Proxy first (Highest Priority - Solves CORS)
    try {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
        // Pass headers specifically for the proxy to forward
        const headers = { ...options.headers } as Record<string, string>;
        
        const res = await fetch(proxyUrl, { 
            ...options,
            headers: headers 
        });
        
        const text = await res.text();

        // If success
        if (res.ok) {
             try { return JSON.parse(text); } catch { return text; }
        }
        
        // Return explicit API errors
        if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 500 || res.status === 402) {
             throw new Error(`${res.status} TCS Error: ${text.substring(0, 200)}`);
        }
    } catch (e: any) {
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

  // Method 1: Authorization API (Client ID / Secret) - POST (Standard for OCI)
  private async getTokenByClientIdPost(baseUrl: string, clientId: string, clientSecret: string): Promise<string> {
      const url = `${baseUrl}/auth/v2/token`;
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
      
      const errorMsg = typeof response === 'object' ? JSON.stringify(response) : String(response).substring(0, 200);
      throw new Error(`Invalid POST Response: ${errorMsg}`);
  }

  // Method 2: Authorization API (Client ID / Secret) - GET
  private async getTokenByClientId(baseUrl: string, clientId: string, clientSecret: string): Promise<string> {
      const url = `${baseUrl}/auth/api/auth?clientid=${clientId}&clientsecret=${clientSecret}`;
      const response = await this.fetchWithFallback(url, { method: 'GET' });
      
      if (response?.result?.accessToken) return response.result.accessToken;
      if (response?.access_token) return response.access_token;
      
      if (typeof response === 'string' && response.length > 20 && !response.includes('{')) {
          return response;
      }
      throw new Error(`Invalid GET Response format`);
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
          try {
              return await this.getTokenByClientIdPost(baseUrl, u, p);
          } catch (e: any) {
              detailedErrors += `[${baseUrl} POST]: ${e.message}\n`;
          }

          try {
              return await this.getTokenByClientId(baseUrl, u, p);
          } catch (e: any) {
              detailedErrors += `[${baseUrl} GET]: ${e.message}\n`;
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
    if (s.includes('arrival') || s.includes('departed') || s.includes('transit') || s.includes('process') || s.includes('manifest')) {
        return OrderStatus.IN_TRANSIT;
    }
    if (s === 'ok') return OrderStatus.DELIVERED; 
    if (s === 'ro') return OrderStatus.RETURNED;

    return OrderStatus.IN_TRANSIT;
  }

  private parseTcsDate(dateStr: string): string {
    if (!dateStr) return new Date().toISOString();
    try {
        const direct = new Date(dateStr);
        if (!isNaN(direct.getTime())) return direct.toISOString();

        const cleanDate = dateStr.split(' ')[0];
        const parts = cleanDate.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
        if (parts) {
            const day = parseInt(parts[1]);
            const month = parseInt(parts[2]) - 1;
            const year = parseInt(parts[3]);
            return new Date(year, month, day).toISOString();
        }
    } catch(e) {}
    return new Date().toISOString();
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
      throw new Error("Tracking not found");
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
      let costCenter = config.merchant_id?.trim();

      if (!costCenter) throw new Error("Missing Cost Center Code (Account Number)");

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 60); 
      
      // Strategy: Try ISO format first, then strict padded format.
      // Some TCS endpoints fail if dates aren't exactly YYYY-MM-DD
      const dateFormats = [
          {
              start: startDate.toISOString().split('T')[0],
              end: endDate.toISOString().split('T')[0]
          },
          {
             start: `${startDate.getFullYear()}-${(startDate.getMonth()+1).toString().padStart(2, '0')}-${startDate.getDate().toString().padStart(2, '0')}`,
             end: `${endDate.getFullYear()}-${(endDate.getMonth()+1).toString().padStart(2, '0')}-${endDate.getDate().toString().padStart(2, '0')}`
          }
      ];

      let response: any = null;

      // "Shotgun" Approach: Try every combination of Date Format x Base URL x Endpoint
      // to find where the data is hiding.
      outerLoop:
      for (const dates of dateFormats) {
          for (const baseUrl of this.BASE_URLS) {
              const endpoints = [
                  // 1. Modern OCI - Financials
                  `${baseUrl}/cod/api/v2/cod-details?accesstoken=${encodeURIComponent(token)}&costCenterCode=${costCenter}&startDate=${dates.start}&endDate=${dates.end}`,
                  // 2. Legacy Ecom - Financials
                  `${baseUrl}/ecom/api/Payment/detail?accesstoken=${encodeURIComponent(token)}&customerno=${costCenter}&fromdate=${dates.start}&todate=${dates.end}`,
                   // 3. Alternative COD Status
                  `${baseUrl}/cod/api/GetCODStatus?accesstoken=${encodeURIComponent(token)}&costCenterCode=${costCenter}&startDate=${dates.start}&endDate=${dates.end}`
              ];

              for (const url of endpoints) {
                  try {
                      const res = await this.fetchWithFallback(url, { method: 'GET' });
                      // Check if response contains array data in any common property
                      if (res && (res.detail || (res.data && Array.isArray(res.data)) || (Array.isArray(res) && res.length > 0) || res.orders)) {
                          response = res;
                          break outerLoop; // Found data, stop searching
                      }
                  } catch (e) {
                      // Silently fail and try next endpoint
                  }
              }
          }
      }

      let ordersList = [];
      if (response?.detail) ordersList = response.detail;
      else if (response?.data && Array.isArray(response.data)) ordersList = response.data;
      else if (response?.orders) ordersList = response.orders;
      else if (Array.isArray(response)) ordersList = response;
      
      if (!ordersList || !Array.isArray(ordersList)) {
          return [];
      }

      return ordersList.map((tcsOrder: any) => {
          const rawStatus = tcsOrder.status || tcsOrder['cn status'] || tcsOrder.Status || 'Unknown';
          const status = this.mapStatus(rawStatus);
          
          let amount = parseFloat(tcsOrder['amount paid'] || 0);
          if (amount === 0 && tcsOrder['cod amount']) {
              amount = parseFloat(tcsOrder['cod amount']);
          }
          if (amount === 0 && tcsOrder.Amount) {
              amount = parseFloat(tcsOrder.Amount);
          }
          
          const deliveryCharges = parseFloat(tcsOrder['delivery charges'] || tcsOrder.DeliveryCharges || 0);
          const orderDate = tcsOrder['booking date'] || tcsOrder['bookingDate'] || tcsOrder.BookingDate;
          const trackingNo = tcsOrder['cn by courier'] || tcsOrder['consignmentNo'] || tcsOrder.ConsignmentNo || '';
          const refNo = tcsOrder['order no'] || tcsOrder['orderRefNo'] || tcsOrder.OrderRefNo || 'N/A';

          return {
              id: trackingNo || Math.random().toString(),
              shopify_order_number: refNo,
              created_at: this.parseTcsDate(orderDate),
              customer_city: tcsOrder.city || tcsOrder['consigneeCity'] || 'Unknown',
              courier: CourierName.TCS,
              tracking_number: trackingNo,
              status: status,
              payment_status: tcsOrder['payment status'] === 'Y' || tcsOrder['paymentStatus'] === 'Paid' ? PaymentStatus.REMITTED : PaymentStatus.UNPAID,
              
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
