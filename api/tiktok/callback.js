
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { auth_code, state } = req.query;

  if (!auth_code || !state) {
    return res.status(400).send("Required parameters (auth_code, state) missing");
  }

  // 1. Decode State to get User ID
  let userId;
  try {
    const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    userId = decodedState.userId;
  } catch (e) {
    return res.status(400).send("Invalid state parameter");
  }

  const appId = process.env.TIKTOK_APP_ID;
  const secret = process.env.TIKTOK_API_SECRET;

  try {
    // 2. Exchange Auth Code for Access Token
    const url = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: appId,
        secret: secret,
        auth_code: auth_code,
      }),
    });

    const data = await response.json();

    if (data.code !== 0) {
       throw new Error(data.message || "Failed to retrieve access token");
    }

    const { access_token, advertiser_ids } = data.data;

    // 3. Save to Supabase
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // If advertiser_ids are returned immediately, pick the first one, otherwise let user select in UI
    const defaultAdAccount = (advertiser_ids && advertiser_ids.length > 0) ? advertiser_ids[0] : null;

    const { error } = await supabase.from('marketing_configs').upsert({
        user_id: userId,
        platform: 'TikTok',
        access_token: access_token,
        ad_account_id: defaultAdAccount, // Can be updated later in UI
        is_active: true
    }, { onConflict: 'user_id, platform' });

    if (error) {
        console.error("DB Error:", error);
        return res.status(500).send("Database error saving token");
    }

    // 4. Redirect back to App
    res.redirect('/?page=integrations&success=tiktok_connected');

  } catch (error) {
    console.error("TikTok Token Exchange Error:", error);
    res.status(500).send("Failed to connect TikTok: " + error.message);
  }
}
