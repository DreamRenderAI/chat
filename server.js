import http from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync } from 'fs';
import { URL } from 'url';

const rooms = new Map(); // Map<roomName, Set<WebSocket>>

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const html = readFileSync('./index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  if (req.method === 'GET' && url.pathname === '/room-list') {
    const roomList = [...rooms.keys()];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ rooms: roomList }));
  }

  // POST /send-message/:room
  const sendMsgMatch = url.pathname.match(/^\/send-message\/([^\/]+)$/);
  if (sendMsgMatch && req.method === 'POST') {
    const roomName = sendMsgMatch[1];
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { message } = JSON.parse(body);
        const clients = rooms.get(roomName);
        if (!clients) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Room not found' }));
        }

        // Broadcast message to all clients in room
        clients.forEach(ws => {
          if (ws.readyState === ws.OPEN) {
            ws.send(`[API] ${message}`);
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch {
        res.writeHead(400);
        res.end('Invalid JSON');
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomName = url.searchParams.get('room');
  if (!roomName) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, ws => {
    if (!rooms.has(roomName)) rooms.set(roomName, new Set());
    const clients = rooms.get(roomName);
    clients.add(ws);

    ws.on('message', message => {
      // Broadcast to everyone except sender
      clients.forEach(client => {
        if (client !== ws && client.readyState === ws.OPEN) {
          client.send(`[${roomName}] ${message}`);
        }
      });
    });

    ws.on('close', () => {
      clients.delete(ws);
      if (clients.size === 0) rooms.delete(roomName);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
