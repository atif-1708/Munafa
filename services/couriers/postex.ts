import { CourierAdapter } from './adapter';
import { IntegrationConfig, TrackingUpdate, OrderStatus, Order, CourierName, PaymentStatus } from '../../types';
import { getOrders, getProducts } from '../mockData'; // Import mock generator for simulation mode

export class PostExAdapter implements CourierAdapter {
  name = CourierName.POSTEX;
  private readonly BASE_URL = 'https://api.postex.pk/services/integration/api';
  
  // PROXY: Required to bypass CORS in browser environments.
  // Note: Free tier has 1MB limit.
  private readonly PROXY_URL = 'https://corsproxy.io/?';

  private getUrl(endpoint: string, params?: Record<string, string | number>): string {
    let url = `${this.BASE_URL}${endpoint}`;
    
    // Append query parameters if they exist (for GET requests)
    if (params) {
        const query = Object.entries(params)
            .filter(([_, value]) => value !== undefined && value !== null)
            .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
            .join('&');
        url += `?${query}`;
    }

    return `${this.PROXY_URL}${encodeURIComponent(url)}`;
  }

  private mapStatus(rawStatus: string): OrderStatus {
    const status = rawStatus?.toLowerCase() || '';
    
    if (status === 'delivered') return OrderStatus.DELIVERED;
    if (status === 'returned') return OrderStatus.RETURNED;
    if (status === 'out for return' || status === 'return to shipper' || status === 'out for return') return OrderStatus.RTO_INITIATED;
    if (status === 'cancelled') return OrderStatus.CANCELLED;
    if (status === 'unbooked') return OrderStatus.PENDING;
    if (status === 'booked') return OrderStatus.BOOKED;
    
    // Transit statuses
    if (
        status === 'postex warehouse' || 
        status === 'out for delivery' || 
        status === 'delivery under review' || 
        status === 'picked by postex' ||
        status === 'en-route to postex warehouse' ||
        status === 'attempted'
    ) {
        return OrderStatus.IN_TRANSIT;
    }

    return OrderStatus.IN_TRANSIT;
  }

  private mapPaymentStatus(status: OrderStatus, rawTransactionStatus: string): PaymentStatus {
    if (status !== OrderStatus.DELIVERED) return PaymentStatus.UNPAID;
    return PaymentStatus.UNPAID;
  }

  private createFingerprint(input: string): string {
      if (!input) return 'unknown-item';
      return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-') // Replace special chars with dash
        .replace(/^-+|-+$/g, '');    // Remove leading/trailing dashes
  }

  // Page 17: Order Tracking API
  async track(trackingNumber: string, config: IntegrationConfig): Promise<TrackingUpdate> {
    // SIMULATION MODE
    if (config.api_token.startsWith('demo_')) {
        await new Promise(r => setTimeout(r, 800));
        return {
            tracking_number: trackingNumber,
            status: OrderStatus.DELIVERED,
            raw_status_text: 'Delivered',
            courier_timestamp: new Date().toISOString(),
            balance_payable: 1500
        };
    }

    try {
      const response = await fetch(this.getUrl(`/order/v1/track-order/${trackingNumber}`), {
        method: 'GET',
        headers: { 
            'token': config.api_token,
            'Accept': 'application/json' 
        }
      });

      if (!response.ok) throw new Error(`PostEx API Error: ${response.status} ${response.statusText}`);
      const data = await response.json();
      
      const orderData = Array.isArray(data.dist) ? data.dist[0] : data.dist;
      
      if (!orderData) throw new Error("Tracking data not found");

      const rawStatus = orderData.transactionStatus || orderData.orderStatus || 'Unknown';
      
      return {
        tracking_number: trackingNumber,
        status: this.mapStatus(rawStatus),
        raw_status_text: rawStatus,
        courier_timestamp: orderData.transactionDate || new Date().toISOString(),
        balance_payable: orderData.invoicePayment || 0
      };
    } catch (error) {
      console.error('PostEx Tracking Failed:', error);
      throw error;
    }
  }

  // Page 12: Order Creation API (v3)
  async createBooking(order: Order, config: IntegrationConfig): Promise<string> {
    // SIMULATION MODE
    if (config.api_token.startsWith('demo_')) {
        await new Promise(r => setTimeout(r, 1000));
        return `DEMO-PX-${Math.floor(Math.random() * 100000)}`;
    }

    const payload = {
      orderRefNumber: order.shopify_order_number,
      invoicePayment: String(order.cod_amount),
      customerName: "Customer",
      customerPhone: "03001234567",
      deliveryAddress: order.customer_city,
      cityName: order.customer_city,
      invoiceDivision: 0, 
      items: order.items.length,
      orderType: "Normal", 
      transactionNotes: "Handle with care" 
    };

    const response = await fetch(this.getUrl(`/order/v3/create-order`), {
      method: 'POST',
      headers: { 
          'token': config.api_token, 
          'Content-Type': 'application/json' 
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`Booking Failed: ${response.status}`);
    const data = await response.json();
    
    if (data.statusCode !== "200") {
        throw new Error(data.statusMessage || "Booking Error");
    }

    return data.dist?.trackingNumber || "";
  }

  // Page 6: Operational Cities API (Used for connection test)
  async testConnection(config: IntegrationConfig): Promise<boolean> {
    // SIMULATION MODE: Bypass check if token starts with 'demo_'
    if (config.api_token.startsWith('demo_')) {
        await new Promise(r => setTimeout(r, 1500)); // Simulate network latency
        return true;
    }

    try {
      const response = await fetch(this.getUrl(`/order/v2/get-operational-city`), {
        method: 'GET',
        headers: { 
            'token': config.api_token,
            'Accept': 'application/json'
        }
      });
      return response.ok;
    } catch (e) {
      console.error("Connection Test Failed:", e);
      return false;
    }
  }

  // Page 29: List Orders API (Get All Orders)
  async fetchRecentOrders(config: IntegrationConfig): Promise<Order[]> {
    // SIMULATION MODE: Generate consistent mock data
    if (config.api_token.startsWith('demo_')) {
        await new Promise(r => setTimeout(r, 1200));
        // Reuse the mock data generator but filter for PostEx only to be realistic
        const mockOrders = getOrders(getProducts()); 
        return mockOrders.map(o => ({...o, courier: CourierName.POSTEX}));
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7); 

    const formatDate = (d: Date) => d.toISOString().split('T')[0]; // yyyy-mm-dd

    const params = {
        orderStatusID: 0, 
        orderStatusId: 0,
        startDate: formatDate(startDate),
        endDate: formatDate(endDate)
    };

    try {
        const response = await fetch(this.getUrl(`/order/v1/get-all-order`, params), {
            method: 'GET',
            headers: { 
                'token': config.api_token, 
                'Accept': 'application/json' 
            }
        });

        if (!response.ok) {
            if (response.status === 403) {
                 const errorText = await response.text();
                 if (errorText.includes('proxy files larger than')) {
                     throw new Error(`Data too large for proxy. Please try 'demo_123' key for simulation.`);
                 }
            }
            throw new Error(`Failed to fetch from PostEx (${response.status}).`);
        }

        const json = await response.json();
        const postExOrders = (json && json.dist) ? json.dist : [];

        return postExOrders.map((po: any) => {
            const status = this.mapStatus(po.transactionStatus);
            const amountStr = String(po.invoicePayment || '0').replace(/,/g, '');
            const amount = parseFloat(amountStr) || 0;
            
            // --- FINGERPRINTING LOGIC ---
            // We do not look for SKU. We fingerprint the description to find unique variants.
            let items: any[] = [];
            
            if (po.orderItems && Array.isArray(po.orderItems) && po.orderItems.length > 0) {
                items = po.orderItems.map((item: any) => {
                    const rawName = item.productName || item.productSKU || 'Unknown';
                    const fingerprint = this.createFingerprint(rawName);
                    
                    return {
                        product_id: 'unknown',
                        quantity: parseInt(item.quantity) || 1,
                        sale_price: parseFloat(item.price) || (amount / po.orderItems.length),
                        product_name: rawName,
                        sku: fingerprint, // We use fingerprint as SKU
                        variant_fingerprint: fingerprint,
                        cogs_at_time_of_order: 0
                    };
                });
            } else {
                // Fallback to Order Detail / Ref
                const rawName = po.orderDetail || po.productName || po.orderRefNumber || 'General Item';
                const fingerprint = this.createFingerprint(rawName);

                items = [{
                    product_id: 'unknown',
                    quantity: 1,
                    sale_price: amount,
                    product_name: rawName,
                    sku: fingerprint, // Use fingerprint as SKU for system consistency
                    variant_fingerprint: fingerprint,
                    cogs_at_time_of_order: 0 
                }];
            }
            
            return {
                id: po.trackingNumber || Math.random().toString(),
                shopify_order_number: po.orderRefNumber || po.trackingNumber,
                created_at: po.transactionDate || new Date().toISOString(),
                customer_city: po.cityName || 'Unknown',
                courier: CourierName.POSTEX,
                tracking_number: po.trackingNumber,
                status: status,
                payment_status: this.mapPaymentStatus(status, po.transactionStatus),
                
                cod_amount: amount,
                shipping_fee_paid_by_customer: 0,
                
                courier_fee: 180, 
                rto_penalty: status === OrderStatus.RETURNED ? 90 : 0,
                packaging_cost: 45,
                overhead_cost: 0,
                tax_amount: 0,
                
                items: items
            };
        });

    } catch (error) {
        console.error("Realtime Fetch Error:", error);
        throw error;
    }
  }
}