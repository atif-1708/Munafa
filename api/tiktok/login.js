
export default async function handler(req, res) {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).send("Missing userId parameter");
  }

  const appId = process.env.TIKTOK_APP_ID;
  
  // Construct Redirect URI
  let host = process.env.HOST || `https://${req.headers.host}`;
  if (host.endsWith('/')) {
      host = host.slice(0, -1);
  }
  const redirectUri = `${host}/api/tiktok/callback`;

  // Generate random state for security (and to pass userId through)
  const csrfState = Math.random().toString(36).substring(7);
  // We encode the userId in the state to retrieve it in the callback
  const state = Buffer.from(JSON.stringify({ csrf: csrfState, userId })).toString('base64');

  // TikTok OAuth URL
  const authUrl = `https://business-api.tiktok.com/portal/auth?app_id=${appId}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}&rid=${appId}`;

  res.redirect(authUrl);
}
