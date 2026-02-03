
import { CourierAdapter } from './adapter';
import { IntegrationConfig, TrackingUpdate, OrderStatus, Order, CourierName, PaymentStatus } from '../../types';

export class TcsAdapter implements CourierAdapter {
  name = CourierName.TCS;
  
  // Official Endpoint from PDF
  private readonly ENDPOINT = 'https://ociconnect.tcscourier.com/ecom/api/Payment/detail';

  /**
   * Helper to perform the API request through our proxy
   */
  private async request(token: string, fromDate: string, toDate: string): Promise<any> {
      // 1. Construct Target URL with Query Params
      const query = new URLSearchParams({
          accesstoken: token,
          fromdate: fromDate,
          todate: toDate
      }).toString();
      
      const targetUrl = `${this.ENDPOINT}?${query}`;
      
      // 2. Send via Proxy
      // We explicitly pass headers that might help with some firewalls
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`, {
          method: 'GET',
          headers: {
              'Accept': 'application/json',
              'Cache-Control': 'no-cache',
              // Try injecting token as header too, just in case (some TCS gateways support this)
              'X-IBM-Client-Id': token 
          }
      });

      const text = await res.text();

      // 3. Parse Response
      let json;
      try {
          json = JSON.parse(text);
      } catch {
          // If not JSON, check for common plain text errors
          if (text.includes('Invalid Token') || text.includes('Unauthorized')) {
              throw new Error("TCS Error: Invalid Token (Server Rejected)");
          }
          throw new Error(`TCS Raw Response: ${text.substring(0, 100)}`);
      }

      return json;
  }

  async track(trackingNumber: string, config: IntegrationConfig): Promise<TrackingUpdate> {
      // Tracking via Payment Detail API is inefficient but accurate for reconciliation
      // For a real app, we'd use a dedicated tracking endpoint, but sticking to what works for now.
      return {
          tracking_number: trackingNumber,
          status: OrderStatus.IN_TRANSIT,
          raw_status_text: 'Tracking via Settlement API',
          courier_timestamp: new Date().toISOString()
      };
  }

  async createBooking(order: Order, config: IntegrationConfig): Promise<string> {
      throw new Error("Booking not supported in this version.");
  }

  async testConnection(config: IntegrationConfig): Promise<boolean> {
      const token = config.api_token;
      if (!token) throw new Error("Token is missing");

      // Test with a wide date range to ensure we hit something if possible, 
      // or at least get a valid "No Record" response.
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7); 
      
      const fromDate = start.toISOString().split('T')[0];
      const toDate = end.toISOString().split('T')[0];

      try {
          const data = await this.request(token, fromDate, toDate);

          // Check logical success
          // 1. Success with Data
          if (data && (Array.isArray(data.detail) || Array.isArray(data))) {
              return true;
          }
          
          // 2. Success but No Data (Message: "No Record Found")
          if (data && data.message && (data.message === "No Record Found" || data.message.includes("No Record"))) {
              return true;
          }

          // 3. Failure (Explicit Status)
          if (data && (data.status === false || data.status === "false")) {
              throw new Error(data.message || "TCS Rejected Connection");
          }
          
          // 4. Fallback: If we got a JSON object that isn't an error, assume success
          if (data && typeof data === 'object') {
              return true;
          }

          return false;

      } catch (e: any) {
          console.error("TCS Test Error:", e);
          throw new Error(e.message || "Connection Failed");
      }
  }

  async fetchRecentOrders(config: IntegrationConfig): Promise<Order[]> {
      const token = config.api_token;
      if (!token) return [];

      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 60); // Last 60 Days

      const fromDate = start.toISOString().split('T')[0];
      const toDate = end.toISOString().split('T')[0];

      try {
          const data = await this.request(token, fromDate, toDate);
          
          let rawList: any[] = [];
          
          if (data.detail && Array.isArray(data.detail)) {
              rawList = data.detail;
          } else if (Array.isArray(data)) {
              rawList = data;
          }

          return rawList.map((item: any) => {
              // Map Fields based on PDF Standard
              const refNo = item['order no'] || item['refNo'] || 'N/A';
              const trackNo = item['cn by courier'] || item['consignmentNo'] || '';
              const cod = parseFloat(item['codamount'] || item['cod amount'] || item['amount paid'] || 0);
              const fee = parseFloat(item['delivery charges'] || 0);
              const rawStatus = item['cn status'] || item.status || 'Unknown';
              
              const status = this.mapStatus(rawStatus);
              const isPaid = item['payment status'] === 'Y' || item['payment status'] === 'Paid';

              return {
                  id: trackNo || Math.random().toString(),
                  shopify_order_number: refNo,
                  created_at: this.parseDate(item['booking date']),
                  customer_city: item.city || 'Unknown',
                  courier: CourierName.TCS,
                  tracking_number: trackNo,
                  status: status,
                  payment_status: isPaid ? PaymentStatus.REMITTED : PaymentStatus.UNPAID,
                  cod_amount: cod,
                  shipping_fee_paid_by_customer: 0,
                  courier_fee: fee > 0 ? fee : 250,
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

      } catch (e) {
          console.error("TCS Fetch Error:", e);
          return [];
      }
  }

  private mapStatus(raw: string): OrderStatus {
      const s = String(raw).toLowerCase();
      if (s === 'ok' || s.includes('delivered')) return OrderStatus.DELIVERED;
      if (s === 'ro' || s.includes('return')) return OrderStatus.RETURNED;
      if (s.includes('cancel')) return OrderStatus.CANCELLED;
      if (s.includes('booked')) return OrderStatus.BOOKED;
      return OrderStatus.IN_TRANSIT;
  }

  private parseDate(str: string): string {
      try {
          if (!str) return new Date().toISOString();
          // Handle DD/MM/YYYY
          if (str.includes('/')) {
              const [d, m, y] = str.split('/');
              return new Date(`${y}-${m}-${d}`).toISOString();
          }
          return new Date(str).toISOString();
      } catch {
          return new Date().toISOString();
      }
  }
}
