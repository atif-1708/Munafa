import { CourierAdapter } from './adapter';
import { IntegrationConfig, TrackingUpdate, OrderStatus, Order, CourierName, PaymentStatus } from '../../types';
import { getOrders, getProducts } from '../mockData';

export class PostExAdapter implements CourierAdapter {
  name = CourierName.POSTEX;
  private readonly BASE_URL = 'https://api.postex.pk/services/integration/api';

  private async fetchWithFallback(endpoint: string, options: RequestInit, params?: Record<string, string | number>): Promise<any> {
    let url = `${this.BASE_URL}${endpoint}`;
    
    if (params) {
        const query = Object.entries(params)
            .filter(([_, value]) => value !== undefined && value !== null)
            .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
            .join('&');
        url += `?${query}`;
    }

    // 1. Try Local API (Vercel)
    try {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl, options);
        if (res.ok) {
             const contentType = res.headers.get('content-type');
             if (contentType && contentType.includes('application/json')) {
                 return await res.json();
             }
        }
    } catch (e) {
        // Ignore and fallback
    }

    // 2. Public Proxies
    const proxies = [
        'https://corsproxy.io/?',
        'https://thingproxy.freeboard.io/fetch/', 
    ];

    let lastError;

    for (const proxyBase of proxies) {
        try {
            let fetchUrl = '';
             if (proxyBase.includes('corsproxy.io')) {
                   fetchUrl = `${proxyBase}${encodeURIComponent(url)}`;
              } else {
                   fetchUrl = `${proxyBase}${url}`;
              }

            const response = await fetch(fetchUrl, options);

            if (!response.ok) {
                 if (response.status === 403) {
                     const text = await response.text();
                     if (text.includes('proxy')) throw new Error('Proxy Limit Exceeded');
                 }
                 throw new Error(`HTTP ${response.status}`);
            }
            
            return await response.json();

        } catch (e: any) {
            console.warn(`PostEx fetch failed via ${proxyBase}`, e);
            lastError = e;
        }
    }
    throw lastError || new Error("All proxy attempts failed");
  }

  private mapStatus(rawStatus: string): OrderStatus {
    const status = rawStatus?.toLowerCase() || '';
    
    if (status === 'delivered') return OrderStatus.DELIVERED;
    if (status === 'returned') return OrderStatus.RETURNED;
    if (status === 'out for return' || status === 'return to shipper' || status === 'out for return') return OrderStatus.RTO_INITIATED;
    if (status === 'cancelled') return OrderStatus.CANCELLED;
    if (status === 'unbooked') return OrderStatus.PENDING;
    if (status === 'booked') return OrderStatus.BOOKED;
    
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
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
  }

  async track(trackingNumber: string, config: IntegrationConfig): Promise<TrackingUpdate> {
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
      const data = await this.fetchWithFallback(`/order/v1/track-order/${trackingNumber}`, {
        method: 'GET',
        headers: { 'token': config.api_token, 'Accept': 'application/json' }
      });
      
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

  async createBooking(order: Order, config: IntegrationConfig): Promise<string> {
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

    try {
        const data = await this.fetchWithFallback(`/order/v3/create-order`, {
          method: 'POST',
          headers: { 'token': config.api_token, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (data.statusCode !== "200") {
            throw new Error(data.statusMessage || "Booking Error");
        }
        return data.dist?.trackingNumber || "";
    } catch (e) {
        throw e;
    }
  }

  async testConnection(config: IntegrationConfig): Promise<boolean> {
    if (config.api_token.startsWith('demo_')) {
        await new Promise(r => setTimeout(r, 1500));
        return true;
    }

    try {
      await this.fetchWithFallback(`/order/v2/get-operational-city`, {
        method: 'GET',
        headers: { 'token': config.api_token, 'Accept': 'application/json' }
      });
      return true;
    } catch (e) {
      console.error("Connection Test Failed:", e);
      return false;
    }
  }

  async fetchRecentOrders(config: IntegrationConfig): Promise<Order[]> {
    if (config.api_token.startsWith('demo_')) {
        await new Promise(r => setTimeout(r, 1200));
        const mockOrders = getOrders(getProducts()); 
        return mockOrders.map(o => ({...o, courier: CourierName.POSTEX}));
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7); 
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    try {
        const json = await this.fetchWithFallback(`/order/v1/get-all-order`, {
            method: 'GET',
            headers: { 'token': config.api_token, 'Accept': 'application/json' }
        }, {
            orderStatusID: 0, 
            orderStatusId: 0,
            startDate: formatDate(startDate),
            endDate: formatDate(endDate)
        });

        const postExOrders = (json && json.dist) ? json.dist : [];

        return postExOrders.map((po: any) => {
            const status = this.mapStatus(po.transactionStatus);
            const amountStr = String(po.invoicePayment || '0').replace(/,/g, '');
            const amount = parseFloat(amountStr) || 0;
            
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
                        sku: fingerprint,
                        variant_fingerprint: fingerprint,
                        cogs_at_time_of_order: 0
                    };
                });
            } else {
                const rawName = po.orderDetail || po.productName || po.orderRefNumber || 'General Item';
                const fingerprint = this.createFingerprint(rawName);

                items = [{
                    product_id: 'unknown',
                    quantity: 1,
                    sale_price: amount,
                    product_name: rawName,
                    sku: fingerprint, 
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