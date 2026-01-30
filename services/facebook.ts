
import { MarketingConfig, AdSpend } from '../types';

export class FacebookService {
    private readonly API_VERSION = 'v19.0';

    // Simulated Data for Demo Mode
    private getMockCampaigns(startDate: string, endDate: string) {
        const campaigns = [
            { id: '111111', name: 'PROMO_WINTER_SALE - Broad' },
            { id: '222222', name: 'RETARGETING_ALL_VISITORS' },
            { id: '333333', name: '[AUDIO-001] Earbuds - Conversion' },
            { id: '444444', name: 'New Arrival - Smart Watch' }
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
                // Random spend between 500 and 5000
                const spend = Math.floor(Math.random() * 4500) + 500;
                data.push({
                    id: crypto.randomUUID(),
                    date: dateStr,
                    platform: 'Facebook',
                    amount_spent: spend,
                    campaign_id: c.id,
                    campaign_name: c.name
                });
            });
        }
        return data;
    }

    async getAdAccounts(token: string): Promise<{id: string, name: string}[]> {
        if (!token || token.startsWith('demo_')) {
            return [
                { id: 'act_101010101', name: 'My Main Ad Account' },
                { id: 'act_202020202', name: 'Backup Account' }
            ];
        }

        try {
            const url = `https://graph.facebook.com/${this.API_VERSION}/me/adaccounts?fields=name,id&access_token=${token}`;
            const res = await fetch(url);
            const json = await res.json();
            if (json.error) throw new Error(json.error.message);
            return json.data || [];
        } catch (e) {
            console.error("FB Get Accounts Error", e);
            throw e;
        }
    }

    async fetchInsights(config: MarketingConfig, startDate: string, endDate: string): Promise<AdSpend[]> {
        if (!config.access_token || config.access_token.startsWith('demo_')) {
            await new Promise(r => setTimeout(r, 1500)); 
            return this.getMockCampaigns(startDate, endDate);
        }

        if (!config.ad_account_id) {
            throw new Error("No Ad Account selected");
        }

        // Ensure act_ prefix if missing (common user error)
        let accountId = config.ad_account_id;
        if (!accountId.startsWith('act_')) {
            accountId = `act_${accountId}`;
        }

        try {
            // Correctly format JSON parameters
            const timeRange = JSON.stringify({ since: startDate, until: endDate });
            
            // Use URLSearchParams for safe encoding of special characters
            const params = new URLSearchParams({
                level: 'campaign',
                time_increment: '1',
                time_range: timeRange,
                fields: 'campaign_id,campaign_name,spend,date_start',
                access_token: config.access_token,
                limit: '500'
            });

            const url = `https://graph.facebook.com/${this.API_VERSION}/${accountId}/insights?${params.toString()}`;
            
            const res = await fetch(url);
            const json = await res.json();
            
            if (json.error) {
                // Handle specific permissions errors
                if (json.error.code === 10 || json.error.code === 200 || json.error.code === 294) {
                     throw new Error(`Permission Error: ${json.error.message}. Ensure token has 'ads_read'.`);
                }
                throw new Error(`Facebook API Error: ${json.error.message}`);
            }

            const data = json.data || [];
            
            return data.map((item: any) => ({
                id: crypto.randomUUID(), 
                date: item.date_start,
                platform: 'Facebook',
                amount_spent: parseFloat(item.spend || '0'),
                campaign_id: item.campaign_id,
                campaign_name: item.campaign_name,
                product_id: undefined // Will be filled by Mapping Strategy in the UI
            }));

        } catch (e: any) {
            console.error("FB Insights Error", e);
            throw e; 
        }
    }
}
