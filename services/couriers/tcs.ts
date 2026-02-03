
import { CourierAdapter } from './adapter';
import { IntegrationConfig, TrackingUpdate, OrderStatus, Order, CourierName, PaymentStatus } from '../../types';

export class TcsAdapter implements CourierAdapter {
  name = CourierName.TCS;
  
  // Base URL for OCI Connect
  private readonly BASE_URL = 'https://ociconnect.tcscourier.com/ecom/api';
  
  // Endpoints to try for order discovery (in order of preference)
  // 1. Payment/detail: Contains Financials (COD, Delivery Charges) - Best for Profitability
  // 2. shipmentinfo: User suggested alternative, likely contains all booked orders but maybe less financial info
  private readonly ENDPOINTS = [
      '/Payment/detail',
      '/shipmentinfo' 
  ];

  /**
   * Helper to perform the API request through our proxy
   */
  private async request(endpoint: string, token: string, fromDate: string, toDate: string): Promise<any> {
      // 1. Construct Target URL with Query Params
      const query = new URLSearchParams({
          accesstoken: token,
          fromdate: fromDate,
          todate: toDate
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
          // Return raw text if it's not JSON (might be an error message or empty)
          return null; 
      }
  }

  async track(trackingNumber: string, config: IntegrationConfig): Promise<TrackingUpdate> {
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

      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7); 
      
      const fromDate = start.toISOString().split('T')[0];
      const toDate = end.toISOString().split('T')[0];

      let lastError = null;

      // Try all endpoints to validate connection
      for (const ep of this.ENDPOINTS) {
          try {
              const data = await this.request(ep, token, fromDate, toDate);
              
              if (data) {
                  // Check for explicit failure
                  if (data.status === false || data.status === "false") {
                      lastError = new Error(data.message || "TCS Rejected Connection");
                      continue;
                  }
                  
                  // Check for success indicators
                  if (
                      Array.isArray(data) || 
                      (data.message && data.message.toLowerCase().includes("no record")) ||
                      Object.keys(data).length > 0
                  ) {
                      return true;
                  }
              }
          } catch (e: any) {
              lastError = e;
              if (e.message.includes("Invalid Token")) throw e;
          }
      }

      throw lastError || new Error("Could not connect to TCS API");
  }

  async fetchRecentOrders(config: IntegrationConfig): Promise<Order[]> {
      const token = config.api_token;
      if (!token) return [];

      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 60); 

      const fromDate = start.toISOString().split('T')[0];
      const toDate = end.toISOString().split('T')[0];

      let rawList: any[] = [];
      
      // Iterate endpoints until we find data
      for (const ep of this.ENDPOINTS) {
          try {
              const data = await this.request(ep, token, fromDate, toDate);
              if (!data) continue;

              // Extract Array from Response
              if (Array.isArray(data)) {
                  rawList = data;
              } else if (data.detail && Array.isArray(data.detail)) {
                  rawList = data.detail;
              } else if (data.shipmentInfo && Array.isArray(data.shipmentInfo)) {
                   rawList = data.shipmentInfo;
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

              if (rawList.length > 0) break; 
          } catch (e) {
              console.warn(`TCS fetch failed on ${ep}`, e);
          }
      }

      return rawList.map((item: any) => {
          // Robust Field Mapping (Handles 'Payment/detail' and 'shipmentinfo' formats)
          
          // 1. Tracking Number
          const trackNo = item['cn by courier'] || item['consignmentNo'] || item['consignmentNumber'] || item['cnNo'] || '';
          
          // 2. Reference Number
          const refNo = item['order no'] || item['refNo'] || item['referenceNo'] || item['orderRef'] || 'N/A';
          
          // 3. COD Amount
          const cod = parseFloat(item['codamount'] || item['codAmount'] || item['amount paid'] || item['codValue'] || 0);
          
          // 4. Delivery Charges (Might be missing in shipmentinfo)
          const fee = parseFloat(item['delivery charges'] || item['deliveryCharges'] || item['serviceCharges'] || 0);
          
          // 5. Status
          const rawStatus = item['cn status'] || item['status'] || item['currentStatus'] || 'Unknown';
          const status = this.mapStatus(rawStatus);
          
          // 6. Payment Status
          const payStatusRaw = item['payment status'] || item['paymentStatus'];
          const isPaid = payStatusRaw === 'Y' || payStatusRaw === 'Paid' || payStatusRaw === 'Remitted';

          // 7. Date
          const dateStr = item['booking date'] || item['bookingDate'] || item['createdOn'];

          return {
              id: trackNo || Math.random().toString(),
              shopify_order_number: refNo,
              created_at: this.parseDate(dateStr),
              customer_city: item.city || item.destination || 'Unknown',
              courier: CourierName.TCS,
              tracking_number: trackNo,
              status: status,
              payment_status: isPaid ? PaymentStatus.REMITTED : PaymentStatus.UNPAID,
              cod_amount: cod,
              shipping_fee_paid_by_customer: 0,
              courier_fee: fee > 0 ? fee : 250, // Fallback if fee is missing in shipmentinfo
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
          // Handle TCS specific formats
          // 1. "09/09/2024" (DD/MM/YYYY)
          if (str.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
              const [d, m, y] = str.split('/');
              return new Date(`${y}-${m}-${d}`).toISOString();
          }
          // 2. "2024-09-09T..."
          return new Date(str).toISOString();
      } catch {
          return new Date().toISOString();
      }
  }
}
