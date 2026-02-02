
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
        
        // Handle API-specific errors that return 200-like headers but error bodies
        if (text.includes("Invalid") || text.includes("Error")) {
             // Continue to try other methods if this was a soft failure
             console.warn("Proxy returned API error:", text);
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
      // Not implemented fully as dashboard focuses on Orders fetch
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
   * Verifies BOTH Credentials AND Account Number by trying to fetch a small data set.
   */
  async testConnection(config: IntegrationConfig): Promise<boolean> {
      try {
          const token = await this.getToken(config);
          const accountNo = config.merchant_id?.trim();
          
          if (!accountNo) throw new Error("Account Number is missing.");

          // Try to fetch data for "yesterday" to validate access
          // We use the same logic as fetchOrders but with a tiny range
          const today = new Date().toISOString().split('T')[0];
          
          for (const baseUrl of this.BASE_URLS) {
              // Try GET Strategy (PDF Standard)
              const getUrl = `${baseUrl}/ecom/api/Payment/detail?accesstoken=${token}&customerno=${accountNo}&fromdate=${today}&todate=${today}`;
              try {
                  const res = await this.fetchUniversal(getUrl, { method: 'GET' });
                  if (res && (res.message === 'SUCCESS' || res.status === 'true' || Array.isArray(res.detail))) {
                      return true;
                  }
              } catch (e) {}
          }
          
          // If we got a token but failed data fetch, strict warning
          throw new Error("Credentials valid, but could not fetch data. Check Account Number.");

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
      const accountNo = config.merchant_id?.trim();
      
      if (!accountNo) throw new Error("Missing Account Number");

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
