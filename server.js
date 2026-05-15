const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3847;
const DATA_FILE = path.join(__dirname, 'todos.json');
const ROOT = __dirname;

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '{}');
}

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // API
  if (req.method === 'GET' && req.url === '/api/todos') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  if (req.method === 'POST' && req.url === '/api/todos') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { JSON.parse(body); fs.writeFileSync(DATA_FILE, body); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); }
      catch (e) { res.writeHead(400); res.end('{"error":"Invalid JSON"}'); }
    });
    return;
  }

  // Static files
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(ROOT, filePath);

  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    return res.end(fs.readFileSync(filePath));
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n  Todo Calendar running at http://localhost:${PORT}\n`);
  console.log(`  Tests: http://localhost:${PORT}/tests/run.html\n`);
});
