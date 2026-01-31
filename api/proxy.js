
export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing "url" query parameter' });
  }

  try {
    const targetUrl = decodeURIComponent(url);

    // Filter out headers we don't want to forward
    const headers = {};
    const skipHeaders = ['host', 'connection', 'origin', 'referer', 'content-length'];
    
    Object.keys(req.headers).forEach(key => {
      if (!skipHeaders.includes(key.toLowerCase())) {
        headers[key] = req.headers[key];
      }
    });

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const contentType = response.headers.get('content-type');
    const linkHeader = response.headers.get('link'); // Pagination support
    const data = await response.text();

    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    
    if (linkHeader) {
      res.setHeader('Link', linkHeader);
    }
    
    res.status(response.status).send(data);
  } catch (error) {
    console.error('Proxy Error:', error);
    res.status(500).json({ error: error.message });
  }
}
