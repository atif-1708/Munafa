
import { MarketingConfig, AdSpend } from '../types';

export class TikTokService {
    private readonly BASE_URL = 'https://business-api.tiktok.com/open_api/v1.3';

    // Mock Data for Demo Mode or Fallback
    private getMockCampaigns(startDate: string, endDate: string, exchangeRate: number) {
        const campaigns = [
            { id: 'tk_111', name: 'TikTok_Viral_Creative_A' },
            { id: 'tk_222', name: 'UGC_Influencer_Boost' },
            { id: 'tk_333', name: 'Broad_Audience_Video' }
        ];

        const data: AdSpend[] = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

        for (let i = 0; i <= diffDays; i++) {
            const current = new Date(start);
            current.setDate(current.getDate() + i);
            const dateStr = current.toISOString().split('T')[0];

            campaigns.forEach(c => {
                // Random USD Spend ($10 - $50)
                const spendUSD = Math.random() * 40 + 10; 
                // Convert to PKR
                const spendPKR = spendUSD * exchangeRate;
                
                // Conversions (Purchases)
                const purchases = Math.floor(spendUSD / 8); // Approx $8 CPA

                data.push({
                    id: crypto.randomUUID(),
                    date: dateStr,
                    platform: 'TikTok',
                    amount_spent: Math.floor(spendPKR),
                    campaign_id: c.id,
                    campaign_name: c.name,
                    purchases: purchases,
                    product_id: undefined 
                });
            });
        }
        return data;
    }

    async getAdvertisers(token: string): Promise<{id: string, name: string}[]> {
        if (!token || token.startsWith('demo_')) {
            return [
                { id: 'adv_123456789', name: 'My TikTok Account' },
            ];
        }

        try {
            // TikTok API: Get Advertiser Info
            const url = `${this.BASE_URL}/oauth2/advertiser/get/`;
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Access-Token': token,
                    'Content-Type': 'application/json'
                }
            });
            const json = await res.json();
            
            if (json.code !== 0) {
                 throw new Error(json.message || "Failed to fetch advertisers");
            }

            return json.data.list.map((adv: any) => ({
                id: adv.advertiser_id,
                name: adv.advertiser_name
            }));
        } catch (e: any) {
            console.error("TikTok Get Advertisers Error", e);
            throw e;
        }
    }

    async fetchInsights(config: MarketingConfig, startDate: string, endDate: string, exchangeRate: number): Promise<AdSpend[]> {
        if (!config.access_token || config.access_token.startsWith('demo_')) {
            await new Promise(r => setTimeout(r, 1500)); 
            return this.getMockCampaigns(startDate, endDate, exchangeRate);
        }

        // Updated: Use the first account from the array
        if (!config.ad_account_ids || config.ad_account_ids.length === 0) {
            throw new Error("No Advertiser ID selected");
        }
        const advertiserId = config.ad_account_ids[0];

        try {
            const url = `${this.BASE_URL}/report/integrated/get/`;
            
            // TikTok API Request
            // Metric: spend (USD), conversion (Total Complete Payment)
            const params = new URLSearchParams({
                advertiser_id: advertiserId,
                report_type: 'BASIC',
                data_level: 'AUCTION_CAMPAIGN',
                dimensions: JSON.stringify(['campaign_id', 'stat_time_day']),
                metrics: JSON.stringify(['spend', 'conversion', 'campaign_name']),
                start_date: startDate,
                end_date: endDate,
                page: '1',
                page_size: '500' 
            });

            const res = await fetch(`${url}?${params.toString()}`, {
                method: 'GET',
                headers: {
                    'Access-Token': config.access_token,
                }
            });

            const json = await res.json();
            
            if (json.code !== 0) {
                throw new Error(`TikTok API Error: ${json.message}`);
            }

            const list = json.data?.list || [];
            
            return list.map((item: any) => {
                const metrics = item.metrics;
                const dim = item.dimensions;
                
                const spendUSD = parseFloat(metrics.spend || '0');
                const spendPKR = spendUSD * exchangeRate;
                const purchases = parseInt(metrics.conversion || '0');

                // Extract Date (stat_time_day usually returns "2023-10-25 00:00:00")
                const dateStr = dim.stat_time_day.split(' ')[0];

                return {
                    id: crypto.randomUUID(), 
                    date: dateStr,
                    platform: 'TikTok',
                    amount_spent: Math.floor(spendPKR), // Store in PKR
                    campaign_id: dim.campaign_id,
                    campaign_name: metrics.campaign_name,
                    purchases: purchases,
                    product_id: undefined 
                };
            });

        } catch (e: any) {
            console.error("TikTok Insights Error", e);
            throw e; 
        }
    }
}
