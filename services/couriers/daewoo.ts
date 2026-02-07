
import { CourierAdapter } from './adapter';
import { IntegrationConfig, TrackingUpdate, OrderStatus, Order, CourierName } from '../../types';

export class DaewooAdapter implements CourierAdapter {
  name = CourierName.DAEWOO;
  private readonly BASE_URL = 'https://codapi.daewoo.net.pk';

  private async request(endpoint: string, config: IntegrationConfig, params: Record<string, string>): Promise<any> {
    const { api_token: apiKey, username: apiUser, password: apiPassword } = config;

    if (!apiKey || !apiUser || !apiPassword) {
        throw new Error("Daewoo requires API Key, API User, and API Password.");
    }

    // Daewoo expects params in query string including auth
    const queryParams = new URLSearchParams({
        apiKey,
        apiUser,
        apiPassword,
        ...params
    }).toString();

    const url = `${this.BASE_URL}/${endpoint}?${queryParams}`;

    try {
        const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        const text = await res.text();
        
        try {
            return JSON.parse(text);
        } catch {
            // Handle non-JSON (HTML error pages)
            throw new Error(`Daewoo API Error: ${res.status}. Body: ${text.substring(0, 100)}`);
        }
    } catch (e: any) {
        throw new Error(`Network/Proxy Error: ${e.message}`);
    }
  }

  async track(trackingNumber: string, config: IntegrationConfig): Promise<TrackingUpdate> {
    try {
        const cleanCN = trackingNumber.replace(/[^0-9]/g, ''); // Ensure numeric
        const data = await this.request('api/booking/quickTrack', config, { trackingNo: cleanCN });

        // Response structure: { Result: { Success, TrackingDetails: [...] } } or direct object depending on error
        const result = data.Result || data;

        if (!result.Success && result.Error) {
             // Daewoo sometimes returns Error: true for not found
             throw new Error(result.Response || "Tracking failed");
        }

        let rawStatus = "Booked";
        let statusDate = new Date().toISOString();
        let found = false;

        // Use TrackingDetails (History) to get latest status
        if (result.TrackingDetails && Array.isArray(result.TrackingDetails) && result.TrackingDetails.length > 0) {
            // Sort by Date desc just in case (Assuming last is latest based on examples)
            // But Daewoo PDF examples show history. We take the last element.
            const latest = result.TrackingDetails[result.TrackingDetails.length - 1];
            if (latest.Status) {
                rawStatus = latest.Status;
                // Parse date "01/10/2018 11:16:01"
                if (latest.Date) statusDate = this.parseDate(latest.Date);
                found = true;
            }
        } 
        // Fallback to CurrentTrackStatus
        else if (result.CurrentTrackStatus && Array.isArray(result.CurrentTrackStatus) && result.CurrentTrackStatus.length > 0) {
             const curr = result.CurrentTrackStatus[0];
             if (curr.status_name) {
                 rawStatus = curr.status_name;
                 found = true;
             }
        }

        if (!found) {
            return {
                tracking_number: trackingNumber,
                status: OrderStatus.BOOKED,
                raw_status_text: "Booked / No Scan",
                courier_timestamp: statusDate
            };
        }

        return {
            tracking_number: trackingNumber,
            status: this.mapStatus(rawStatus),
            raw_status_text: rawStatus,
            courier_timestamp: statusDate
        };

    } catch (e: any) {
        console.error("Daewoo Track Error:", e);
        // Return default state on error to prevent app crash, unless strict error handling needed
        throw e;
    }
  }

  async createBooking(order: Order, config: IntegrationConfig): Promise<string> {
    throw new Error("Daewoo Booking not supported in this version.");
  }

  async testConnection(config: IntegrationConfig): Promise<boolean> {
    try {
        // Use getLocations as a safe read-only endpoint to test credentials
        const data = await this.request('api/cargo/getLocations', config, {});
        
        // Check standard Success flag
        if (data && data.Success === true) {
            return true;
        }
        
        // Daewoo sometimes returns { Success: false, Response: "Invalid Credentials" }
        if (data && data.Success === false) {
            throw new Error(data.Response || "Invalid Credentials");
        }

        throw new Error("Unknown API response structure");
    } catch (e: any) {
        console.error("Daewoo Test Failed:", e);
        return false;
    }
  }

  async fetchRecentOrders(config: IntegrationConfig): Promise<Order[]> {
    // Daewoo does not provide a "List All Orders" endpoint.
    // We rely on Shopify Backfill to find orders and then track them individually.
    return [];
  }

  private mapStatus(raw: string): OrderStatus {
      const s = raw.toUpperCase();

      if (s.includes("DELIVERED") || s.includes("OK - DELIVERED")) return OrderStatus.DELIVERED;
      
      if (s.includes("RETURN") || s.includes("RTO") || s.includes("REFUSED") || s.includes("CANCEL")) {
          // If it reached origin, it's Returned
          if (s.includes("ORIGIN") || s.includes("SHIPPER")) return OrderStatus.RETURNED;
          return OrderStatus.RTO_INITIATED;
      }

      if (s.includes("ON ROUTE") || s.includes("TRANSIT") || s.includes("ARRIVAL") || s.includes("DEPARTURE")) {
          return OrderStatus.IN_TRANSIT;
      }

      return OrderStatus.BOOKED;
  }

  private parseDate(dateStr: string): string {
      try {
          // Format: "01/10/2018 11:16:01" -> DD/MM/YYYY HH:mm:ss
          const parts = dateStr.split(' ');
          if (parts.length >= 1) {
              const dateParts = parts[0].split('/');
              if (dateParts.length === 3) {
                  // ISO: YYYY-MM-DD
                  let isoDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
                  if (parts.length > 1) isoDate += `T${parts[1]}`;
                  return new Date(isoDate).toISOString();
              }
          }
          return new Date(dateStr).toISOString();
      } catch {
          return new Date().toISOString();
      }
  }
}
