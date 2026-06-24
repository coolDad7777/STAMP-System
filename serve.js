const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT) || 4747;
const API_TARGET = process.env.API_TARGET || 'http://127.0.0.1:3000';

const STATIC_ROUTES = {
  '/': 'demo-portal.html',
  '/index.html': 'demo-portal.html',
  '/demo-portal.html': 'demo-portal.html',
  '/client': 'participant-client.html',
  '/participant': 'participant-client.html',
  '/participant-client.html': 'participant-client.html',
  '/facility-qr.html': 'facility-qr.html'
};

function proxyApi(req, res) {
  const url = new URL(req.url, API_TARGET);
  const options = {
    hostname: url.hostname,
    port: url.port || 80,
    path: url.pathname + url.search,
    method: req.method,
    headers: { ...req.headers, host: url.host }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Backend unavailable', detail: err.message }));
  });

  req.pipe(proxyReq);
}

function serveStatic(req, res) {
  const route = STATIC_ROUTES[req.url?.split('?')[0]] || null;
  if (!route) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<h1>404</h1><p><a href="/">Validator Portal</a> | <a href="/client">Client App</a></p>');
    return;
  }

  const filePath = path.join(__dirname, route);
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<h1>500 Server Error</h1>');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);
  if (req.url.startsWith('/api/')) {
    proxyApi(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`STAMP gateway at http://0.0.0.0:${port}/`);
  console.log(`  Validator portal: /`);
  console.log(`  Client check-in:  /client`);
  console.log(`  Facility QR:      /facility-qr.html`);
  console.log(`  API proxy -> ${API_TARGET}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    server.listen(port + 1, '0.0.0.0');
  } else {
    console.error('Server error:', err);
  }
});
