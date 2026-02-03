
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

  private mapStatus(rawStatus: string): OrderStatus {
    const s = String(rawStatus || '').toLowerCase();
    
    // Page 23/34 Mappings
    if (s === 'ok' || s === 'delivered' || s === 'shipment delivered') return OrderStatus.DELIVERED;
    if (s === 'ro' || s === 'return to origin' || s === 'returned') return OrderStatus.RETURNED;
    if (s === 'cr' || s === 'cn') return OrderStatus.RETURNED; 
    
    if (s.includes('delivered')) return OrderStatus.DELIVERED;
    if (s.includes('return') || s.includes('rto')) return OrderStatus.RETURNED;
    if (s.includes('cancel')) return OrderStatus.CANCELLED;
    if (s.includes('booked')) return OrderStatus.BOOKED;
    
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
   * Validation Test: Checks if credentials are valid by attempting a quick fetch
   */
  async testConnection(config: IntegrationConfig): Promise<boolean> {
      try {
          const token = config.api_token;
          const accountNo = config.merchant_id?.trim();

          if (!token) throw new Error("API Token is required.");
          if (!accountNo) throw new Error("Account Number is required.");

          // Perform a lightweight check. Since there isn't a dedicated "ping" endpoint documented
          // that takes just a token, we try fetching 1 day of data. Even if empty, a 200 OK means success.
          const today = new Date().toISOString().split('T')[0];
          
          for (const baseUrl of this.BASE_URLS) {
              const url = `${baseUrl}/ecom/api/Payment/detail?accesstoken=${encodeURIComponent(token)}&customerno=${accountNo}&fromdate=${today}&todate=${today}`;
              try {
                  const res = await this.fetchUniversal(url, { method: 'GET' });
                  // If we get a response object with 'detail' or 'message', the credentials worked.
                  if (res && (res.detail || res.message || res.status === 'true' || res.status === true)) {
                      return true;
                  }
                  // If unauthorized, it usually returns status: false or code: 401
                  if (res && (res.code === 401 || res.status === 'UnAuthorized')) {
                      throw new Error("Invalid Token or Account Number.");
                  }
              } catch (e) {
                  // Continue to next base URL
              }
          }
          
          // If we reach here, no endpoint worked
          throw new Error("Could not validate credentials with TCS.");

      } catch (e: any) {
          console.error("TCS Test Failed:", e);
          throw new Error(e.message);
      }
  }

  /**
   * Fetches orders strictly using the Payment Detail API (Page 22) with Token + Account Number
   */
  async fetchRecentOrders(config: IntegrationConfig): Promise<Order[]> {
      const token = config.api_token;
      const accountNo = config.merchant_id?.trim();
      
      if (!token || !accountNo) {
          console.error("Critical: Missing TCS Token or Account Number.");
          return [];
      }

      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 60); 

      // Date Format: The PDF examples use "2024-09-08" (YYYY-MM-DD). 
      const fromDate = start.toISOString().split('T')[0];
      const toDate = end.toISOString().split('T')[0];

      let rawData: any[] = [];

      for (const baseUrl of this.BASE_URLS) {
          // Endpoint from PDF Page 22
          const endpoint = `${baseUrl}/ecom/api/Payment/detail`;
          
          // Construct Query Params
          const query = `?accesstoken=${encodeURIComponent(token)}&customerno=${accountNo}&fromdate=${fromDate}&todate=${toDate}`;
          
          try {
              const res = await this.fetchUniversal(endpoint + query, { method: 'GET' });
              
              if (res?.detail && Array.isArray(res.detail)) {
                  rawData = res.detail;
                  break; // Success
              } else if (res?.message === "Invalid CN" || res?.message?.includes("No Record")) {
                  // Valid connection but no data
                  break; 
              }
          } catch (e) {
              console.warn(`Failed TCS fetch on ${baseUrl}`, e);
          }
      }

      if (rawData.length === 0) return [];

      return rawData.map((item: any) => {
          // Map Fields based on PDF Response (Page 22/23)
          const refNo = item['order no'] || item['refNo'] || 'N/A';
          const trackNo = item['cn by courier'] || item['consignmentNo'] || '';
          
          // Financials
          const cod = parseFloat(item['codamount'] || item['cod amount'] || item['amount paid'] || 0);
          
          // PDF Page 22 shows "delivery charges": 116. This is the cost to seller.
          const shipFee = parseFloat(item['delivery charges'] || 0);
          
          // Status Mapping
          const rawStatus = item['cn status'] || item.status;
          const status = this.mapStatus(rawStatus);
          
          // Payment Status: "payment status": "N" or "Y" or "Paid"
          const isRemitted = item['payment status'] === 'Y' || item['payment status'] === 'Paid';

          // Date Parsing (PDF shows "09/09/2024")
          const createdDate = this.parseDate(item['booking date']);

          return {
              id: trackNo || Math.random().toString(),
              shopify_order_number: refNo,
              created_at: createdDate,
              customer_city: item.city || 'Unknown',
              courier: CourierName.TCS,
              tracking_number: trackNo,
              status: status,
              payment_status: isRemitted ? PaymentStatus.REMITTED : PaymentStatus.UNPAID,
              
              cod_amount: cod,
              shipping_fee_paid_by_customer: 0,
              
              // If API returns 0 fee (happens on Booked status), fallback to constant, otherwise use real fee
              courier_fee: shipFee > 0 ? shipFee : 250, 
              
              // TCS RTO Penalty is often embedded in delivery charges or separate line items not shown in basic detail.
              // For safety, if Returned, we assume the delivery charge INCLUDES the return penalty or is just the forward cost lost.
              rto_penalty: 0, 
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
          if (!dateStr) return new Date().toISOString();
          // Handle "09/09/2024" (DD/MM/YYYY) format from PDF
          if (dateStr.includes('/')) {
              const parts = dateStr.split('/');
              if (parts.length === 3) {
                  // DD/MM/YYYY -> YYYY-MM-DD
                  return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).toISOString();
              }
          }
          return new Date(dateStr).toISOString();
      } catch {
          return new Date().toISOString();
      }
  }
}
