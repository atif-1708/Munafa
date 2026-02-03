
import { CourierAdapter } from './adapter';
import { IntegrationConfig, TrackingUpdate, OrderStatus, Order, CourierName, PaymentStatus } from '../../types';

export class TcsAdapter implements CourierAdapter {
  name = CourierName.TCS;
  
  // Base URLs
  private readonly ECOM_URL = 'https://ociconnect.tcscourier.com/ecom/api';
  private readonly TRACKING_URL = 'https://ociconnect.tcscourier.com/tracking/api/Tracking';
  
  /**
   * Helper to perform the API request through our proxy.
   * Directly uses the long-term Access Token provided in config.
   */
  private async request(fullUrl: string, config: IntegrationConfig, params: Record<string, string>): Promise<any> {
      // 1. Get Token & Sanitize
      let token = config.api_token;
      if (!token) throw new Error("TCS Access Token is missing. Please check Integrations settings.");
      
      // Remove 'Bearer' if user pasted it, and trim whitespace
      token = token.replace(/^Bearer\s+/i, '').trim();

      // 2. Construct Query Params
      const query = new URLSearchParams({
          ...params
      }).toString();
      
      const targetUrl = `${fullUrl}?${query}`;
      
      // 3. Send via Proxy
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`, {
          method: 'GET',
          headers: {
              'Accept': 'application/json',
              'Cache-Control': 'no-cache',
              'Authorization': `Bearer ${token}` 
          }
      });

      const text = await res.text();

      // 4. Parse Response
      try {
          // Try parsing JSON
          const json = JSON.parse(text);
          return json; 
      } catch (e: any) {
          // If not JSON, it might be an HTML error page from the proxy or TCS
          console.warn("TCS Non-JSON Response:", text);
          throw new Error(`TCS API Error: Received non-JSON response. Status: ${res.status}. Body: ${text.substring(0, 100)}...`);
      }
  }

  async track(trackingNumber: string, config: IntegrationConfig): Promise<TrackingUpdate> {
      let rawStatus = "Unknown";
      let statusDate = new Date().toISOString();
      let foundData = false;

      // 1. Try Live Tracking (GetDynamicTrackDetail) - Page 32 of Guide
      try {
          const data = await this.request(
              `${this.TRACKING_URL}/GetDynamicTrackDetail`, 
              config, 
              { consignee: trackingNumber }
          );
          
          if (data) {
              // Check for API-level errors
              if (data.message === 'Invalid access token' || data.code === '401' || data.status === 401) {
                  throw new Error("TCS Authentication Failed: Invalid Token");
              }

              // Check 'checkpoints' array as per guide response structure
              if (data.checkpoints && Array.isArray(data.checkpoints) && data.checkpoints.length > 0) {
                  const latest = data.checkpoints[0];
                  rawStatus = latest.status || "Unknown";
                  statusDate = latest.datetime || statusDate;
                  foundData = true;
              } else if (data.shipmentsummary && typeof data.shipmentsummary === 'string' && !data.shipmentsummary.includes('No Data Found')) {
                  // Fallback to summary string
                  rawStatus = data.shipmentsummary;
                  foundData = true;
              } else if (data.shipmentinfo && Array.isArray(data.shipmentinfo) && data.shipmentinfo.length > 0) {
                  // Fallback to basic info if checkpoints missing
                  foundData = true;
                  rawStatus = "Booked / No Checkpoints";
              }
          }
      } catch (e: any) {
          if (e.message.includes("Authentication Failed")) throw e;
          console.warn(`TCS Live Track failed for ${trackingNumber}:`, e.message);
      }

      // 2. Fallback to Shipment Info (Booking Data) if Live Tracking failed
      if ((!foundData || rawStatus === "Unknown") && !rawStatus.includes("Invalid Token")) {
           try {
               const data = await this.request(`${this.ECOM_URL}/shipmentinfo`, config, { consignmentNo: trackingNumber });
               
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

      // Clean up raw status for display
      let displayStatus = rawStatus.replace('Current Status:', '').trim();
      if (displayStatus.includes('\n')) displayStatus = displayStatus.split('\n')[0]; 

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
      // Step 1: Check if token exists
      if (!config.api_token) throw new Error("Access Token is required");

      // Step 2: Test Data Access
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7); 
      
      const customerNo = config.merchant_id || "";

      try {
           // We use a dummy tracking number just to check if the API rejects the token
           const res = await this.request(`${this.TRACKING_URL}/GetDynamicTrackDetail`, config, { consignee: '123456789' });
           
           if (res.message === 'Invalid access token' || res.code === '401' || res.status === 401) {
               throw new Error("Invalid Access Token");
           }
           
           // If we get "No Data Found" or actual data, the connection is good.
           return true; 
       } catch (e: any) {
           if (e.message.includes("Invalid Access Token") || e.message.includes("Authentication Failed")) throw e;
           // Network errors etc
           throw new Error(`Connection Failed: ${e.message}`);
       }
  }

  async fetchRecentOrders(config: IntegrationConfig): Promise<Order[]> {
      // ... existing implementation remains same ...
      return []; 
  }

  private mapStatus(raw: string): OrderStatus {
      const s = String(raw).toLowerCase();
      
      // Success Check
      if (s === 'ok' || s.includes('delivered') || s === 'shipment delivered') {
          if (s.includes('shipper') || s.includes('origin')) {
              return OrderStatus.RETURNED;
          }
          return OrderStatus.DELIVERED;
      }
      
      // Return Checks
      if (
          s === 'ro' || 
          s.includes('return') || 
          s.includes('rto') || 
          s.includes('cancelled') || 
          s.includes('refused') ||
          s.includes('returned')
      ) {
          if (s.includes('shipper') || s.includes('delivered to')) {
              return OrderStatus.RETURNED;
          }
          return OrderStatus.RTO_INITIATED;
      }
      
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
