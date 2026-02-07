
import { CourierName } from './types';

// Average shipping rates in Pakistan (PKR) used for simulation
export const COURIER_RATES = {
  [CourierName.TRAX]: { forward: 180, rto: 90 },
  [CourierName.LEOPARDS]: { forward: 200, rto: 100 },
  [CourierName.TCS]: { forward: 250, rto: 0 }, // TCS sometimes charges full upfront
  [CourierName.POSTEX]: { forward: 170, rto: 85 },
  [CourierName.MNP]: { forward: 190, rto: 95 },
  [CourierName.CALLCOURIER]: { forward: 160, rto: 80 },
  [CourierName.DAEWOO]: { forward: 220, rto: 0 }, // Daewoo / FastEx default
};

export const PACKAGING_COST_AVG = 45; // Polybag + Flyer

export const CITIES = [
  'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 
  'Multan', 'Peshawar', 'Quetta', 'Sialkot', 'Gujranwala'
];

export const MOCK_PRODUCTS = [
  { title: 'Wireless Earbuds Pro', sku: 'AUDIO-001', cogs: 1200, price: 3500 },
  { title: 'Smart Watch Gen 5', sku: 'WEAR-005', cogs: 2500, price: 6500 },
  { title: 'Leather Wallet (Men)', sku: 'ACC-020', cogs: 450, price: 1500 },
  { title: 'Beard Trimmer Kit', sku: 'GROOM-009', cogs: 1800, price: 4200 },
  { title: 'Gaming RGB Mouse', sku: 'TECH-101', cogs: 900, price: 2800 },
];
