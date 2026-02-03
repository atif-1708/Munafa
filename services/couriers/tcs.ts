
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

      let rawStatus = "Unknown";
      let statusDate = new Date().toISOString();
      let foundData = false;

      // 1. Try Live Tracking (GetDynamicTrackDetail) - Preferred for checkpoints
      try {
          const data = await this.request(
              `${this.TRACKING_URL}/GetDynamicTrackDetail`, 
              config.api_token, 
              { consignee: trackingNumber }
          );
          
          if (data) {
              if (data.checkpoints && Array.isArray(data.checkpoints) && data.checkpoints.length > 0) {
                  // Checkpoints usually sorted newest first
                  const latest = data.checkpoints[0];
                  rawStatus = latest.status || "Unknown";
                  statusDate = latest.datetime || statusDate;
                  foundData = true;
              } else if (data.shipmentsummary && typeof data.shipmentsummary === 'string' && !data.shipmentsummary.includes('No Data Found')) {
                  rawStatus = data.shipmentsummary;
                  foundData = true;
              }
          }
      } catch (e) {
          console.warn(`TCS Live Track failed for ${trackingNumber}, attempting fallback.`);
      }

      // 2. Fallback to Shipment Info (Booking Data) if Live Tracking failed
      if (!foundData || rawStatus === "Unknown") {
           try {
               const data = await this.request(`${this.ECOM_URL}/shipmentinfo`, config.api_token, { consignmentNo: trackingNumber });
               
               let item = null;
               if (Array.isArray(data) && data.length > 0) item = data[0];
               else if (data && data.shipmentInfo) item = data.shipmentInfo;
               else if (data && data.consignmentNo) item = data;

               if (item) {
                   const s = item['cn status'] || item['currentStatus'] || item['status'];
                   if (s) {
                       rawStatus = s;
                       foundData = true;
                   }
               }
           } catch (e) {
               console.warn(`TCS Fallback failed for ${trackingNumber}`);
           }
      }

      // 3. Map status or default
      const status = this.mapStatus(rawStatus);

      // Clean up raw status for display if it's messy
      let displayStatus = rawStatus;
      if (rawStatus.includes('\n')) displayStatus = rawStatus.split('\n')[0]; // Take first line if summary

      return {
          tracking_number: trackingNumber,
          status: status,
          raw_status_text: displayStatus, 
          courier_timestamp: statusDate
      };
  }

  async createBooking(order: Order, config: IntegrationConfig): Promise<string> {
      throw new Error("Booking not supported in this version.");
  }

  async testConnection(config: IntegrationConfig): Promise<boolean> {
      const token = config.api_token;
      if (!token) throw new Error("Token is missing");

      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7); 
      
      try {
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
           try {
               await this.request(`${this.TRACKING_URL}/GetDynamicTrackDetail`, token, { consignee: '123456' });
               return true; 
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
      
      try {
          const data = await this.request(`${this.ECOM_URL}/Payment/detail`, token, {
              fromdate: start.toISOString().split('T')[0],
              todate: end.toISOString().split('T')[0]
          });

          if (!data) return [];

          let rawList: any[] = [];
          if (Array.isArray(data)) rawList = data;
          else if (data.detail && Array.isArray(data.detail)) rawList = data.detail;
          else {
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
      
      // 2. RETURNED
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
      
      // 3. IN TRANSIT
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
