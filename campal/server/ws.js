// Zero-dependency RFC 6455 WebSocket server for Node.js
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME_BYTES = 256 * 1024; // 256 KB safety cap

export class WSClient extends EventEmitter {
  constructor(socket, req) {
    super();
    this.socket = socket;
    this.req = req;
    this.readyState = 1; // 1 = OPEN, 3 = CLOSED
    this.isAlive = true;
    this._buffer = Buffer.alloc(0);
    this._fragments = [];
    this._fragmentOpcode = 0;

    socket.setNoDelay(true);
    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this._cleanup());
    socket.on('error', () => this._cleanup());
  }

  _cleanup() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this._buffer = Buffer.alloc(0);
    this._fragments = [];
    this.emit('close');
  }

  _onData(chunk) {
    if (this.readyState !== 1) return;
    this._buffer = this._buffer.length === 0 ? chunk : Buffer.concat([this._buffer, chunk]);

    while (this._buffer.length >= 2) {
      const b0 = this._buffer[0];
      const b1 = this._buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this._buffer.length < 4) return;
        payloadLen = this._buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this._buffer.length < 10) return;
        const hi = this._buffer.readUInt32BE(2);
        const lo = this._buffer.readUInt32BE(6);
        payloadLen = hi * 0x100000000 + lo;
        offset = 10;
      }

      if (payloadLen > MAX_FRAME_BYTES) {
        this.close(1009, 'Message too large');
        return;
      }

      const maskBytes = masked ? 4 : 0;
      const totalLen = offset + maskBytes + payloadLen;
      if (this._buffer.length < totalLen) return;

      let payload = Buffer.allocUnsafe(payloadLen);
      if (masked) {
        const m0 = this._buffer[offset];
        const m1 = this._buffer[offset + 1];
        const m2 = this._buffer[offset + 2];
        const m3 = this._buffer[offset + 3];
        const dataStart = offset + 4;
        for (let i = 0; i < payloadLen; i++) {
          const maskByte = i % 4 === 0 ? m0 : i % 4 === 1 ? m1 : i % 4 === 2 ? m2 : m3;
          payload[i] = this._buffer[dataStart + i] ^ maskByte;
        }
      } else {
        this._buffer.copy(payload, 0, offset, offset + payloadLen);
      }

      this._buffer = this._buffer.subarray(totalLen);
      this._handleFrame(fin, opcode, payload);
      if (this.readyState !== 1) return;
    }
  }

  _handleFrame(fin, opcode, payload) {
    // Control frames
    if (opcode === 0x8) {
      // Close
      this._sendFrame(0x8, payload.subarray(0, 2));
      this.socket.end();
      this._cleanup();
      return;
    }
    if (opcode === 0x9) {
      // Ping -> reply Pong
      this.isAlive = true;
      this._sendFrame(0xA, payload);
      return;
    }
    if (opcode === 0xA) {
      // Pong
      this.isAlive = true;
      return;
    }

    // Data frames (text 0x1, binary 0x2, continuation 0x0)
    if (opcode !== 0x0) {
      this._fragmentOpcode = opcode;
      this._fragments = [payload];
    } else {
      this._fragments.push(payload);
    }

    if (fin) {
      const full = this._fragments.length === 1 ? this._fragments[0] : Buffer.concat(this._fragments);
      const op = this._fragmentOpcode;
      this._fragments = [];
      this._fragmentOpcode = 0;

      if (op === 0x1) {
        this.emit('message', full.toString('utf8'));
      } else if (op === 0x2) {
        this.emit('message', full);
      }
    }
  }

  _sendFrame(opcode, payloadBuf) {
    if (this.readyState !== 1 || this.socket.destroyed) return;
    const len = payloadBuf.length;
    let header;

    if (len < 126) {
      header = Buffer.allocUnsafe(2);
      header[0] = 0x80 | opcode;
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.allocUnsafe(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.allocUnsafe(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeUInt32BE(Math.floor(len / 0x100000000), 2);
      header.writeUInt32BE(len >>> 0, 6);
    }

    try {
      this.socket.write(Buffer.concat([header, payloadBuf]));
    } catch {
      this._cleanup();
    }
  }

  send(text) {
    if (this.readyState !== 1) return;
    const buf = typeof text === 'string' ? Buffer.from(text, 'utf8') : text;
    this._sendFrame(typeof text === 'string' ? 0x1 : 0x2, buf);
  }

  sendJSON(obj) {
    this.send(JSON.stringify(obj));
  }

  ping() {
    if (this.readyState !== 1) return;
    this._sendFrame(0x9, Buffer.alloc(0));
  }

  close(code = 1000, reason = '') {
    if (this.readyState !== 1) return;
    const reasonBuf = Buffer.from(reason, 'utf8');
    const buf = Buffer.allocUnsafe(2 + reasonBuf.length);
    buf.writeUInt16BE(code, 0);
    reasonBuf.copy(buf, 2);
    this._sendFrame(0x8, buf);
    this.socket.end();
    this._cleanup();
  }
}

export class WSServer extends EventEmitter {
  constructor(httpServer) {
    super();
    this.clients = new Set();

    httpServer.on('upgrade', (req, socket) => {
      const upgrade = (req.headers.upgrade || '').toLowerCase();
      const key = req.headers['sec-websocket-key'];
      if (upgrade !== 'websocket' || !key) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      const accept = crypto
        .createHash('sha1')
        .update(key + WS_GUID)
        .digest('base64');

      const headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '\r\n',
      ];
      socket.write(headers.join('\r\n'));

      const client = new WSClient(socket, req);
      this.clients.add(client);
      client.on('close', () => {
        this.clients.delete(client);
      });
      this.emit('connection', client, req);
    });

    // Heartbeat interval to detect silently dropped connections
    this._heartbeat = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          client.socket.destroy();
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }, 20000);
    this._heartbeat.unref?.();
  }

  close() {
    clearInterval(this._heartbeat);
    for (const client of this.clients) {
      client.close(1001, 'Server shutting down');
    }
    this.clients.clear();
  }
}
