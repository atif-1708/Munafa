
import { CourierAdapter } from './adapter';
import { IntegrationConfig, TrackingUpdate, OrderStatus, Order, CourierName, PaymentStatus } from '../../types';

export class TcsAdapter implements CourierAdapter {
  name = CourierName.TCS;
  
  // Base URLs
  private readonly ECOM_URL = 'https://ociconnect.tcscourier.com/ecom/api';
  private readonly TRACKING_URL = 'https://ociconnect.tcscourier.com/tracking/api/Tracking';
  
  /**
   * Helper to perform the API request through our proxy
   */
  private async request(fullUrl: string, token: string, params: Record<string, string>): Promise<any> {
      // 1. Construct Query Params
      const query = new URLSearchParams({
          ...params
      }).toString();
      
      const targetUrl = `${fullUrl}?${query}`;
      
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

      // UPDATED: Using 'GetDynamicTrackDetail' from PDF Page 32
      // This endpoint provides live checkpoints
      const data = await this.request(
          `${this.TRACKING_URL}/GetDynamicTrackDetail`, 
          config.api_token, 
          { consignee: trackingNumber }
      );
      
      if (!data) {
          throw new Error("Tracking not found");
      }

      // Checkpoints array contains the history. The first one is usually the latest status.
      // Or we can use 'shipmentsummary'
      
      let rawStatus = "Unknown";
      let statusDate = new Date().toISOString();

      if (data.checkpoints && Array.isArray(data.checkpoints) && data.checkpoints.length > 0) {
          // Checkpoints usually sorted newest first, but let's be safe
          const latest = data.checkpoints[0];
          rawStatus = latest.status || "Unknown";
          statusDate = latest.datetime || statusDate;
      } else if (data.shipmentsummary) {
          rawStatus = data.shipmentsummary;
      }

      const status = this.mapStatus(rawStatus);

      return {
          tracking_number: trackingNumber,
          status: status,
          raw_status_text: rawStatus, // e.g. "Arrived at TCS Facility"
          courier_timestamp: statusDate
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
          const data = await this.request(`${this.ECOM_URL}/Payment/detail`, token, {
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
               await this.request(`${this.TRACKING_URL}/GetDynamicTrackDetail`, token, { consignee: '123456' });
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
          const data = await this.request(`${this.ECOM_URL}/Payment/detail`, token, {
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
                  courier_raw_status: rawStatus,
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
      
      // 1. DELIVERED
      if (s === 'ok' || s.includes('delivered') || s === 'shipment delivered') {
          return OrderStatus.DELIVERED;
      }
      
      // 2. RETURNED (Aggregating all RTO/Cancel types)
      if (
          s === 'ro' || 
          s.includes('return') || 
          s.includes('rto') || 
          s.includes('cancelled') || 
          s.includes('refused') ||
          s.includes('returned')
      ) {
          return OrderStatus.RETURNED;
      }
      
      // 3. IN TRANSIT (Aggregating Booked, Pending, In Transit, Arrivals, etc.)
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
