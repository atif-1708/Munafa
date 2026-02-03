
import { CourierAdapter } from './adapter';
import { IntegrationConfig, TrackingUpdate, OrderStatus, Order, CourierName, PaymentStatus } from '../../types';

export class TcsAdapter implements CourierAdapter {
  name = CourierName.TCS;
  
  // Base URL for OCI Connect
  private readonly BASE_URL = 'https://ociconnect.tcscourier.com/ecom/api';
  
  /**
   * Helper to perform the API request through our proxy
   */
  private async request(endpoint: string, token: string, params: Record<string, string>): Promise<any> {
      // 1. Construct Target URL with Query Params
      const query = new URLSearchParams({
          accesstoken: token,
          ...params
      }).toString();
      
      const targetUrl = `${this.BASE_URL}${endpoint}?${query}`;
      
      // 2. Send via Proxy
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`, {
          method: 'GET',
          headers: {
              'Accept': 'application/json',
              'Cache-Control': 'no-cache',
              'X-IBM-Client-Id': token 
          }
      });

      const text = await res.text();

      // 3. Parse Response
      try {
          return JSON.parse(text);
      } catch {
          if (text.includes('Invalid Token') || text.includes('Unauthorized')) {
              throw new Error("TCS Error: Invalid Token");
          }
          return null; 
      }
  }

  async track(trackingNumber: string, config: IntegrationConfig): Promise<TrackingUpdate> {
      if (!config.api_token) throw new Error("Token missing");

      // Use shipmentinfo for tracking as requested by user
      const data = await this.request('/shipmentinfo', config.api_token, { consignmentNo: trackingNumber });
      
      let item = null;
      if (Array.isArray(data) && data.length > 0) item = data[0];
      else if (data && data.shipmentInfo) item = data.shipmentInfo;
      else if (data && data.consignmentNo) item = data; // Sometimes direct object

      if (!item) {
          throw new Error("Tracking not found");
      }

      const rawStatus = item['cn status'] || item['currentStatus'] || item['status'] || 'Unknown';
      const status = this.mapStatus(rawStatus);

      return {
          tracking_number: trackingNumber,
          status: status,
          raw_status_text: rawStatus,
          courier_timestamp: new Date().toISOString()
      };
  }

  async createBooking(order: Order, config: IntegrationConfig): Promise<string> {
      throw new Error("Booking not supported in this version.");
  }

  async testConnection(config: IntegrationConfig): Promise<boolean> {
      const token = config.api_token;
      if (!token) throw new Error("Token is missing");

      // Test with Payment/detail as it is the most reliable for list checking
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7); 
      
      try {
          // Check Payment Detail (Financial)
          const data = await this.request('/Payment/detail', token, {
              fromdate: start.toISOString().split('T')[0],
              todate: end.toISOString().split('T')[0]
          });

          if (data && (data.status === false || data.status === "false")) {
              throw new Error(data.message || "TCS Rejected Connection");
          }
          return true;
      } catch (e: any) {
           if (e.message.includes("Invalid Token")) throw e;
           
           // Fallback: Try tracking a dummy number just to check token validity
           try {
               await this.request('/shipmentinfo', token, { consignmentNo: '123456' });
               return true; // If we get here without Invalid Token error, token is good
           } catch (e2) {
               throw e;
           }
      }
  }

  async fetchRecentOrders(config: IntegrationConfig): Promise<Order[]> {
      const token = config.api_token;
      if (!token) return [];

      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 60); 

      // We ONLY use Payment/detail for bulk fetching because 'shipmentinfo' 
      // typically does not support date ranges for listing all bookings.
      // We will rely on App.tsx to "Backfill" other orders via individual tracking.
      
      try {
          const data = await this.request('/Payment/detail', token, {
              fromdate: start.toISOString().split('T')[0],
              todate: end.toISOString().split('T')[0]
          });

          if (!data) return [];

          let rawList: any[] = [];
          
          if (Array.isArray(data)) {
              rawList = data;
          } else if (data.detail && Array.isArray(data.detail)) {
              rawList = data.detail;
          } else {
             // Fallback: Check for ANY array property
             const keys = Object.keys(data);
             for(const k of keys) {
                 if(Array.isArray(data[k]) && data[k].length > 0) {
                     rawList = data[k];
                     break;
                 }
             }
          }

          return rawList.map((item: any) => {
              const trackNo = item['cn by courier'] || item['consignmentNo'] || '';
              const refNo = item['order no'] || item['refNo'] || 'N/A';
              const cod = parseFloat(item['codamount'] || item['amount paid'] || 0);
              const fee = parseFloat(item['delivery charges'] || 0);
              const rawStatus = item['cn status'] || item['status'] || 'Unknown';
              
              const isPaid = item['payment status'] === 'Y' || item['payment status'] === 'Paid';

              return {
                  id: trackNo || Math.random().toString(),
                  shopify_order_number: refNo,
                  created_at: this.parseDate(item['booking date']),
                  customer_city: item.city || 'Unknown',
                  courier: CourierName.TCS,
                  tracking_number: trackNo,
                  status: this.mapStatus(rawStatus),
                  payment_status: isPaid ? PaymentStatus.REMITTED : PaymentStatus.UNPAID,
                  cod_amount: cod,
                  shipping_fee_paid_by_customer: 0,
                  courier_fee: fee > 0 ? fee : 250, 
                  rto_penalty: 0,
                  packaging_cost: 45,
                  overhead_cost: 0,
                  tax_amount: 0,
                  data_source: 'settlement',
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
          console.warn("TCS Payment List fetch failed, defaulting to empty list.", e);
          return [];
      }
  }

  private mapStatus(raw: string): OrderStatus {
      const s = String(raw).toLowerCase();
      if (s === 'ok' || s.includes('delivered') || s === 'shipment delivered') return OrderStatus.DELIVERED;
      if (s === 'ro' || s.includes('return') || s.includes('rto')) return OrderStatus.RETURNED;
      if (s.includes('cancel')) return OrderStatus.CANCELLED;
      if (s.includes('booked') || s.includes('booking')) return OrderStatus.BOOKED;
      return OrderStatus.IN_TRANSIT;
  }

  private parseDate(str: string): string {
      try {
          if (!str) return new Date().toISOString();
          if (str.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
              const [d, m, y] = str.split('/');
              return new Date(`${y}-${m}-${d}`).toISOString();
          }
          return new Date(str).toISOString();
      } catch {
          return new Date().toISOString();
      }
  }
}
