import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        {
          name: 'vite-api-proxy',
          configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
              if (req.url && req.url.startsWith('/api/proxy')) {
                try {
                  const urlObj = new URL(req.url, 'http://localhost:3000');
                  const targetUrlParam = urlObj.searchParams.get('url');
                  if (!targetUrlParam) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Missing url parameter' }));
                    return;
                  }
                  
                  const targetUrl = decodeURIComponent(targetUrlParam);
                  const shopifyToken = req.headers['x-shopify-access-token'] as string;
                  
                  const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                    'User-Agent': 'MunafaBakhsh-App/1.0',
                  };
                  
                  if (shopifyToken) {
                    headers['X-Shopify-Access-Token'] = shopifyToken;
                  }

                  const response = await fetch(targetUrl, {
                    method: req.method || 'GET',
                    headers: headers,
                  });

                  const data = await response.text();
                  const responseHeaders = response.headers;
                  
                  const contentType = responseHeaders.get('content-type');
                  if (contentType) {
                    res.setHeader('Content-Type', contentType);
                  }
                  
                  const linkHeader = responseHeaders.get('link');
                  if (linkHeader) {
                    res.setHeader('Link', linkHeader);
                    res.setHeader('Access-Control-Expose-Headers', 'Link');
                  }

                  res.statusCode = response.status;
                  res.end(data);
                  return;
                } catch (err: any) {
                  console.error('Vite Proxy Error:', err);
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: err.message }));
                  return;
                }
              }
              next();
            });
          }
        }
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
