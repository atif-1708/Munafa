
import { CourierAdapter } from './adapter';
import { IntegrationConfig, TrackingUpdate, OrderStatus, Order, CourierName, PaymentStatus } from '../../types';

export class TcsAdapter implements CourierAdapter {
  name = CourierName.TCS;
  // Production Base URL from Page 4/5/22 of guide
  private readonly BASE_URL = 'https://ociconnect.tcscourier.com';

  private async fetchWithFallback(url: string, options: RequestInit): Promise<any> {
    // 1. Try Local Proxy first (to bypass CORS)
    try {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl, options);
        if (res.ok) {
             const text = await res.text();
             try { return JSON.parse(text); } catch { /* ignore non-json */ }
        }
    } catch (e) {}

    // 2. Public Proxies (Fallback)
    const proxies = [
        { base: 'https://corsproxy.io/?', encode: true },
        { base: 'https://thingproxy.freeboard.io/fetch/', encode: false },
    ];

    let lastError: Error | null = null;

    for (const proxy of proxies) {
        try {
            const fetchUrl = proxy.encode ? `${proxy.base}${encodeURIComponent(url)}` : `${proxy.base}${url}`;
            const response = await fetch(fetchUrl, { ...options, credentials: 'omit' });
            
            if (!response.ok) {
                 const text = await response.text();
                 lastError = new Error(`TCS API Error ${response.status}: ${text}`);
                 continue;
            }
            
            const text = await response.text();
            try { return JSON.parse(text); } catch { return text; }

        } catch (e: any) {
            console.warn(`TCS fetch failed via proxy`, e.message);
            lastError = e;
        }
    }
    
    throw lastError || new Error("Network Error: Could not connect to TCS.");
  }

  // Page 4: Authorization API
  private async getToken(config: IntegrationConfig): Promise<string> {
      // Mapping: username -> clientId, password -> clientSecret
      const clientId = config.username; 
      const clientSecret = config.password;

      if (!clientId || !clientSecret) throw new Error("Missing TCS Client ID or Secret");

      const url = `${this.BASE_URL}/auth/api/auth?clientid=${clientId}&clientsecret=${clientSecret}`;
      
      const response = await this.fetchWithFallback(url, { method: 'GET' });
      
      if (response && response.result && response.result.accessToken) {
          return response.result.accessToken;
      }
      
      throw new Error("Failed to authenticate with TCS. Check Client ID/Secret.");
  }

  private mapStatus(rawStatus: string): OrderStatus {
    const s = rawStatus?.toLowerCase() || '';
    
    if (s.includes('delivered')) return OrderStatus.DELIVERED;
    if (s.includes('return') || s.includes('rto')) return OrderStatus.RETURNED;
    if (s.includes('cancel')) return OrderStatus.CANCELLED;
    if (s.includes('booked')) return OrderStatus.BOOKED;
    
    // TCS "OK" usually means delivered or active, "RO" is Return Origin
    if (s === 'ok') return OrderStatus.DELIVERED; 
    if (s === 'ro') return OrderStatus.RETURNED;

    return OrderStatus.IN_TRANSIT;
  }

  // Unused for now, but required by interface
  async track(trackingNumber: string, config: IntegrationConfig): Promise<TrackingUpdate> {
      const token = await this.getToken(config);
      // Page 32: Tracking API
      const url = `${this.BASE_URL}/tracking/api/Tracking/GetDynamicTrackDetail?consignee=${trackingNumber}`;
      
      const data = await this.fetchWithFallback(url, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
      });

      // Parse shipmentinfo or deliveryinfo
      const info = data.shipmentinfo?.[0] || data.deliveryinfo?.[0];
      if (!info) throw new Error("No tracking info found");

      return {
          tracking_number: trackingNumber,
          status: this.mapStatus(info.status),
          raw_status_text: info.status,
          courier_timestamp: info.datetime || new Date().toISOString()
      };
  }

  async createBooking(order: Order, config: IntegrationConfig): Promise<string> {
      throw new Error("Booking not implemented for TCS yet.");
  }

  async testConnection(config: IntegrationConfig): Promise<boolean> {
      try {
          const token = await this.getToken(config);
          return !!token;
      } catch (e) {
          console.error("TCS Connection Test Failed:", e);
          return false;
      }
  }

  // Page 22: Payment Detail API
  async fetchRecentOrders(config: IntegrationConfig): Promise<Order[]> {
      const token = await this.getToken(config);
      const costCenter = config.merchant_id; // Mapping: merchant_id -> costCenterCode

      if (!costCenter) throw new Error("Missing Cost Center Code (Customer Number)");

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 60); 
      
      // Format: YYYY-MM-DD
      const fromParams = startDate.toISOString().split('T')[0];
      const toParams = endDate.toISOString().split('T')[0];

      // Note: Guide says GET, but typically huge params go in body. 
      // However, Guide implies GET with query params for this endpoint structure.
      const url = `${this.BASE_URL}/ecom/api/Payment/detail?accesstoken=${encodeURIComponent(token)}&customerno=${costCenter}&fromdate=${fromParams}&todate=${toParams}`;

      const response = await this.fetchWithFallback(url, { method: 'GET' });

      if (!response.detail || !Array.isArray(response.detail)) {
          return [];
      }

      return response.detail.map((tcsOrder: any) => {
          // Mapping from Page 23 Sample Response
          const rawStatus = tcsOrder.status || tcsOrder['cn status'] || 'Unknown';
          const status = this.mapStatus(rawStatus);
          
          // "amount paid" is usually the remittance. 
          // TCS Payment Detail endpoint does NOT strictly return the original COD amount if unpaid.
          // We use 'amount paid' as the COD amount for Delivered items.
          let amount = parseFloat(tcsOrder['amount paid'] || 0);
          
          // If amount is 0 but it's delivered, we might be missing data, but we can't invent it.
          // We'll rely on the app's reconciliation to fill gaps if Shopify is connected.
          
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
              
              cod_amount: amount, // Limitation: May be 0 if unpaid
              shipping_fee_paid_by_customer: 0,
              
              courier_fee: deliveryCharges > 0 ? deliveryCharges : 250, // Default to 250 if missing
              rto_penalty: status === OrderStatus.RETURNED ? 0 : 0, // TCS RTO often charged upfront or 0
              packaging_cost: 45, // Global default
              overhead_cost: 0,
              tax_amount: 0,
              
              // Dummy item since TCS doesn't return line items
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
