import { IntegrationConfig, TrackingUpdate, Order, CourierName } from '../../types';

export interface CourierAdapter {
  name: CourierName;
  
  /**
   * Fetches the latest status from the courier API.
   * In production, this runs on the server to avoid CORS.
   */
  track(trackingNumber: string, config: IntegrationConfig): Promise<TrackingUpdate>;
  
  /**
   * Pushes a new order to the courier system to generate a tracking number.
   */
  createBooking(order: Order, config: IntegrationConfig): Promise<string>;
  
  /**
   * Validates if the provided credentials work.
   */
  testConnection(config: IntegrationConfig): Promise<boolean>;

  /**
   * Fetches recent orders (e.g., last 30 days) directly from the courier.
   * Used to sync the dashboard when no database is present.
   */
  fetchRecentOrders(config: IntegrationConfig): Promise<Order[]>;
}