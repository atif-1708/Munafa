
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export default async function handler(req, res) {
  const { shop, hmac, code, state } = req.query;

  if (!shop || !hmac || !code || !state) {
    return res.status(400).send("Required parameters missing");
  }

  // 1. Verify HMAC (Security Check)
  // Remove hmac from query object to verify signature
  const map = { ...req.query };
  delete map['hmac'];
  delete map['signature']; // Sometimes present

  // Sort keys alphabetically (required by Shopify)
  const message = Object.keys(map)
    .sort()
    .map(key => `${key}=${map[key]}`)
    .join('&');

  const generatedHash = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');

  if (generatedHash !== hmac) {
    return res.status(400).send("HMAC validation failed");
  }

  // 2. Decode State to get User ID
  let userId;
  try {
    const decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    userId = decodedState.userId;
  } catch (e) {
    return res.status(400).send("Invalid state parameter");
  }

  // 3. Exchange Code for Access Token
  try {
    const accessTokenRequestUrl = `https://${shop}/admin/oauth/access_token`;
    const tokenResponse = await fetch(accessTokenRequestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
        throw new Error(JSON.stringify(tokenData));
    }

    // 4. Save to Supabase
    // We need SERVICE_ROLE_KEY to bypass RLS if we are inserting for a specific user ID from the backend
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Upsert Sales Channel
    const { error } = await supabase.from('sales_channels').upsert({
        user_id: userId,
        platform: 'Shopify',
        store_url: shop,
        access_token: tokenData.access_token,
        scope: tokenData.scope,
        is_active: true,
        last_sync_at: new Date().toISOString()
    }, { onConflict: 'user_id, platform' });

    if (error) {
        console.error("DB Error:", error);
        return res.status(500).send("Database error saving token");
    }

    // 5. Redirect back to App
    res.redirect('/?page=integrations&success=shopify_connected');

  } catch (error) {
    console.error("Token Exchange Error:", error);
    res.status(500).send("Failed to exchange access token: " + error.message);
  }
}
