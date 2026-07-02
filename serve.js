const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function serveFile(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  
  // Remove trailing slash
  if (urlPath.endsWith('/')) {
    urlPath = urlPath.slice(0, -1);
  }
  
  // Default to index.html
  if (urlPath === '') {
    urlPath = '/index.html';
  }
  
  // If it's a directory path (no extension), try index.html
  if (!path.extname(urlPath)) {
    urlPath = urlPath + '/index.html';
  }
  
  let filePath = path.join('.', urlPath);
  
  // Security check: prevent directory traversal
  let resolvedPath = path.resolve(filePath);
  let projectPath = path.resolve('.');
  if (!resolvedPath.startsWith(projectPath)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    
    let ext = path.extname(filePath).toLowerCase();
    let contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  serveFile(req, res);
});

const PORT = 8889;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
