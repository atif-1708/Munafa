
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
                // Random purchases based on spend (approx 800-1500 per purchase)
                const estimatedCPA = Math.floor(Math.random() * 700) + 800;
                const purchases = Math.floor(spend / estimatedCPA);

                data.push({
                    id: crypto.randomUUID(),
                    date: dateStr,
                    platform: 'Facebook',
                    amount_spent: spend,
                    campaign_id: c.id,
                    campaign_name: c.name,
                    purchases: purchases
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
            if (json.error) {
                 if (json.error.code === 190) {
                     throw new Error("Session Expired. Please update your Facebook Access Token in Integrations.");
                 }
                 throw new Error(json.error.message);
            }
            return json.data || [];
        } catch (e: any) {
            console.error("FB Get Accounts Error", e);
            throw e;
        }
    }

    // Updated to accept MarketingConfig with ad_account_ids array
    async fetchInsights(config: MarketingConfig, startDate: string, endDate: string): Promise<AdSpend[]> {
        if (!config.access_token || config.access_token.startsWith('demo_')) {
            await new Promise(r => setTimeout(r, 1500)); 
            return this.getMockCampaigns(startDate, endDate);
        }

        if (!config.ad_account_ids || config.ad_account_ids.length === 0) {
            throw new Error("No Ad Accounts selected");
        }

        const fetchForAccount = async (rawAccountId: string) => {
            // Ensure act_ prefix if missing (common user error)
            let accountId = rawAccountId;
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
                    // Request 'actions' to get purchase data
                    fields: 'campaign_id,campaign_name,spend,date_start,actions',
                    access_token: config.access_token,
                    limit: '500'
                });

                const url = `https://graph.facebook.com/${this.API_VERSION}/${accountId}/insights?${params.toString()}`;
                
                const res = await fetch(url);
                const json = await res.json();
                
                if (json.error) {
                    // Handle specific permissions errors
                    if (json.error.code === 10 || json.error.code === 200 || json.error.code === 294) {
                        throw new Error(`Permission Error on ${accountId}: ${json.error.message}. Ensure token has 'ads_read'.`);
                    }
                    if (json.error.code === 190) {
                        throw new Error("Session Expired. Please update your Facebook Access Token in Integrations.");
                    }
                    console.warn(`Error fetching FB account ${accountId}: ${json.error.message}`);
                    return []; // Skip this account if specific error
                }

                const data = json.data || [];
                
                return data.map((item: any) => {
                    // Extract Purchases from actions array
                    const actions = item.actions || [];
                    // Look for standard 'purchase' or pixel specific purchase events
                    const purchaseAction = actions.find((a: any) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
                    const purchases = purchaseAction ? parseInt(purchaseAction.value) : 0;

                    return {
                        id: crypto.randomUUID(), 
                        date: item.date_start,
                        platform: 'Facebook',
                        amount_spent: parseFloat(item.spend || '0'),
                        campaign_id: item.campaign_id,
                        campaign_name: item.campaign_name,
                        purchases: purchases,
                        product_id: undefined // Will be filled by Mapping Strategy in the UI
                    };
                });
            } catch (e: any) {
                console.error(`FB Insights Error for ${accountId}`, e);
                return []; 
            }
        };

        // Fetch all accounts in parallel
        const results = await Promise.all(config.ad_account_ids.map(id => fetchForAccount(id)));
        
        // Flatten array
        return results.flat();
    }
}
