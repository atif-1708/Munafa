
export default async function handler(req, res) {
  const { shop, userId } = req.query;

  if (!shop || !userId) {
    return res.status(400).send("Missing shop or userId parameter");
  }

  // Sanitize shop URL
  const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;
  let cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
  
  // If user enters 'my-store', append .myshopify.com
  cleanShop = cleanShop.includes('.') ? cleanShop : `${cleanShop}.myshopify.com`;

  if (!shopRegex.test(cleanShop)) {
    return res.status(400).send("Invalid shop domain. Please format as 'your-store.myshopify.com'");
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const scopes = 'read_orders,read_products,read_customers';
  
  // Construct Redirect URI (Must match Shopify App Settings)
  // In Vercel, use system env var or fallback to request host
  let host = process.env.HOST || `https://${req.headers.host}`;
  
  // SAFETY: Remove trailing slash if present in env var to avoid double slashes (e.g. .com//api)
  if (host.endsWith('/')) {
      host = host.slice(0, -1);
  }
  
  const redirectUri = `${host}/api/shopify/callback`;

  // Generate a random nonce
  const nonce = Math.random().toString(36).substring(7);
  
  // State passes data to the callback securely
  // We encode the userId so we know who to save the token for
  const state = Buffer.from(JSON.stringify({ nonce, userId })).toString('base64');

  // Build the Shopify Auth URL
  const installUrl = `https://${cleanShop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  res.redirect(installUrl);
}
