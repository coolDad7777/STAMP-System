const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT) || 4747;

const server = http.createServer((req, res) => {
    console.log(`Request for: ${req.url}`);
    
    let filePath;
    if (req.url === '/' || req.url === '/index.html') {
        filePath = path.join(__dirname, 'participant-demo.html');
    } else if (req.url === '/participant-demo.html') {
        filePath = path.join(__dirname, 'participant-demo.html');
    } else if (req.url === '/demo-portal.html') {
        filePath = path.join(__dirname, 'demo-portal.html');
    } else {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1><p>Try the <a href="/participant-demo.html">participant demo</a> or <a href="/demo-portal.html">validator portal</a>.</p>');
        return;
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            console.error('Error reading file:', err);
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
});

server.listen(port, '0.0.0.0', () => {
    console.log(`🚀 STAMP Demo Server running at http://localhost:${port}/`);
    console.log(`📱 Participant app: http://localhost:${port}/participant-demo.html`);
    console.log(`🛡️ Validator portal: http://localhost:${port}/demo-portal.html`);
    console.log('');
    console.log('🎯 Demo Features:');
    console.log('  • Click any demo account button to login instantly');
    console.log('  • Navigate between Dashboard, Verification, etc.');
    console.log('  • Try bulk verification on the Verification page');
    console.log('  • Watch status changes in real-time');
    console.log('');
    console.log('Press Ctrl+C to stop the server');
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is busy, trying port ${port + 1}...`);
        server.listen(port + 1, 'localhost');
    } else {
        console.error('Server error:', err);
    }
});