
import { CourierAdapter } from './adapter';
import { IntegrationConfig, TrackingUpdate, OrderStatus, Order, CourierName, PaymentStatus } from '../../types';

export class TcsAdapter implements CourierAdapter {
  name = CourierName.TCS;
  
  // TCS Endpoints based on v1.0 PDF
  private readonly BASE_URLS = [
      'https://ociconnect.tcscourier.com', // Primary Production
      'https://api.tcscourier.com',
      'https://apis.tcscourier.com'
  ];

  /**
   * Universal Fetcher that tries multiple proxies and methods
   */
  private async fetchUniversal(url: string, options: RequestInit): Promise<any> {
    const targetUrl = url;
    
    // 1. Try Local Proxy (Best for CORS)
    try {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
        const headers = { ...options.headers } as Record<string, string>;
        
        const res = await fetch(proxyUrl, { ...options, headers });
        const text = await res.text();

        if (res.ok) {
             try { return JSON.parse(text); } catch { return text; }
        }
    } catch (e) {
        console.warn("Local proxy failed:", e);
    }

    // 2. Try CORS Proxy (Fallback)
    try {
        const corsUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        const res = await fetch(corsUrl, { ...options, credentials: 'omit' });
        const text = await res.text();
        if (res.ok) {
            try { return JSON.parse(text); } catch { return text; }
        }
    } catch (e) {
        console.warn("CORS proxy failed:", e);
    }

    throw new Error("Unable to connect to TCS API via any route.");
  }

  /**
   * Helper: Decode JWT to find ClientID/Account Number
   * The TCS Token contains the clientid in the payload.
   */
  private extractAccountFromToken(token: string): string | null {
      if (!token) return null;
      try {
          // JWT structure: Header.Payload.Signature
          const parts = token.split('.');
          if (parts.length !== 3) return null;

          const base64Url = parts[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));

          const payload = JSON.parse(jsonPayload);
          
          // PDF V1.0 implies 'clientid' is in the token payload
          // We check common variations just in case
          return payload.clientid || payload.ClientId || payload.unique_name || payload.sub || payload.nameid || null;
      } catch (e) {
          console.error("Error decoding TCS Token:", e);
          return null;
      }
  }

  /**
   * Get Token - Strictly follows PDF GET method
   */
  private async getToken(config: IntegrationConfig): Promise<string> {
      // Manual Token Override
      if (config.api_token && config.api_token.length > 50) return config.api_token;

      if (!config.username || !config.password) {
          throw new Error("Client ID and Client Secret are required.");
      }

      for (const baseUrl of this.BASE_URLS) {
          const url = `${baseUrl}/auth/api/auth?clientid=${config.username}&clientsecret=${config.password}`;
          try {
              const res = await this.fetchUniversal(url, { method: 'GET' });
              if (res?.result?.accessToken) return res.result.accessToken;
              if (res?.access_token) return res.access_token;
          } catch (e) {}
      }
      throw new Error("Authentication Failed. Please check Client ID and Secret.");
  }

  private mapStatus(rawStatus: string): OrderStatus {
    const s = String(rawStatus || '').toLowerCase();
    
    if (s.includes('delivered')) return OrderStatus.DELIVERED;
    if (s.includes('return') || s.includes('rto')) return OrderStatus.RETURNED;
    if (s.includes('cancel')) return OrderStatus.CANCELLED;
    if (s.includes('booked')) return OrderStatus.BOOKED;
    // Specific TCS codes
    if (s === 'ok') return OrderStatus.DELIVERED;
    if (s === 'ro') return OrderStatus.RETURNED;
    if (s === 'cr') return OrderStatus.RETURNED; // Credit/Return
    
    return OrderStatus.IN_TRANSIT;
  }

  // --- Core Implementation ---

  async track(trackingNumber: string, config: IntegrationConfig): Promise<TrackingUpdate> {
      return {
          tracking_number: trackingNumber,
          status: OrderStatus.IN_TRANSIT,
          raw_status_text: 'Tracking Not Synced',
          courier_timestamp: new Date().toISOString()
      };
  }

  async createBooking(order: Order, config: IntegrationConfig): Promise<string> {
      throw new Error("Booking not supported.");
  }

  /**
   * Deep Connection Test
   */
  async testConnection(config: IntegrationConfig): Promise<boolean> {
      try {
          const token = await this.getToken(config);
          
          // Verify we can find an account number (either explicit or extracted)
          const accountNo = config.merchant_id?.trim() || this.extractAccountFromToken(token);
          
          if (!token) return false;
          if (!accountNo) {
              console.warn("Token is valid but could not extract Account Number. Data fetch might fail.");
              // We return true for connection, but data fetch will likely throw specific error
          }
          
          return true;
      } catch (e: any) {
          console.error("TCS Test Failed:", e);
          throw new Error(e.message);
      }
  }

  /**
   * Fetches orders using "Shotgun" approach (GET & POST) to handle API ambiguity
   */
  async fetchRecentOrders(config: IntegrationConfig): Promise<Order[]> {
      const token = await this.getToken(config);
      
      // PRIORITY 1: Use Explicit Merchant ID (if provided in Settings)
      // PRIORITY 2: Use Client ID (Username)
      // PRIORITY 3: Extract from Token (Manual Token Mode)
      let accountNo = config.merchant_id?.trim() || config.username?.trim();
      
      if (!accountNo) {
          accountNo = this.extractAccountFromToken(token) || '';
      }
      
      if (!accountNo) {
          // Last ditch effort: Try without account number (API might error, but we try)
          console.warn("No Account Number found. Attempting fetch without it (likely to fail).");
      }

      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30); // 30 Days window

      const dateFormats = [
          { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }, // YYYY-MM-DD
          { start: start.toISOString().split('T')[0].replace(/-/g, ''), end: end.toISOString().split('T')[0].replace(/-/g, '') } // YYYYMMDD
      ];

      let rawData: any[] = [];

      // Try combinations until we get data
      outerLoop:
      for (const dates of dateFormats) {
          for (const baseUrl of this.BASE_URLS) {
              const endpoint = `${baseUrl}/ecom/api/Payment/detail`;
              
              // Strategy A: GET with Query Params (PDF Page 22 Table)
              try {
                  const query = `?accesstoken=${encodeURIComponent(token)}&customerno=${accountNo}&fromdate=${dates.start}&todate=${dates.end}`;
                  const res = await this.fetchUniversal(endpoint + query, { method: 'GET' });
                  
                  if (res?.detail && Array.isArray(res.detail)) {
                      rawData = res.detail;
                      break outerLoop;
                  }
              } catch (e) {}

              // Strategy B: POST with JSON Body (PDF Page 22 JSON Payload)
              try {
                  const res = await this.fetchUniversal(endpoint, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          accesstoken: token,
                          customerno: accountNo,
                          fromdate: dates.start,
                          todate: dates.end
                      })
                  });

                  if (res?.detail && Array.isArray(res.detail)) {
                      rawData = res.detail;
                      break outerLoop;
                  }
              } catch (e) {}
          }
      }

      if (rawData.length === 0) return [];

      return rawData.map((item: any) => {
          // Map Fields based on PDF Response (Page 22/23)
          const refNo = item['order no'] || item['refNo'] || 'N/A';
          const trackNo = item['cn by courier'] || item['consignmentNo'] || '';
          
          // Parse Money
          const cod = parseFloat(item['codamount'] || item['cod amount'] || item['amount paid'] || 0);
          const shipFee = parseFloat(item['delivery charges'] || 0);
          
          // Status
          const status = this.mapStatus(item['cn status'] || item.status);
          const isRemitted = item['payment status'] === 'Y' || item['payment status'] === 'Paid';

          return {
              id: trackNo || Math.random().toString(),
              shopify_order_number: refNo,
              created_at: this.parseDate(item['booking date']),
              customer_city: item.city || 'Unknown',
              courier: CourierName.TCS,
              tracking_number: trackNo,
              status: status,
              payment_status: isRemitted ? PaymentStatus.REMITTED : PaymentStatus.UNPAID,
              
              cod_amount: cod,
              shipping_fee_paid_by_customer: 0,
              
              courier_fee: shipFee > 0 ? shipFee : 250,
              rto_penalty: status === OrderStatus.RETURNED ? 0 : 0, // TCS doesn't usually charge RTO separately on this API
              packaging_cost: 45,
              overhead_cost: 0,
              tax_amount: 0,
              items: [{
                  product_id: 'unknown',
                  quantity: 1,
                  sale_price: cod,
                  product_name: 'TCS Order',
                  sku: 'TCS-GENERIC',
                  variant_fingerprint: 'tcs-generic',
                  cogs_at_time_of_order: 0
              }]
          };
      });
  }

  private parseDate(dateStr: string): string {
      try {
          // Handle "09/09/2024" format from PDF
          if (dateStr.includes('/')) {
              const [d, m, y] = dateStr.split('/');
              return new Date(`${y}-${m}-${d}`).toISOString();
          }
          return new Date(dateStr).toISOString();
      } catch {
          return new Date().toISOString();
      }
  }
}
