/**
 * Lightweight WebSocket Server
 *
 * Zero-dependency WebSocket implementation built on Node.js `node:http`.
 * Implements RFC 6455 for basic text-frame WebSocket communication.
 * Sufficient for the mobile socket protocol (JSON text messages).
 */

import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-5AB5DC65C175";

// WebSocket opcodes
const OPCODE_CONTINUATION = 0x0;
const OPCODE_TEXT = 0x1;
const OPCODE_BINARY = 0x2;
const OPCODE_CLOSE = 0x8;
const OPCODE_PING = 0x9;
const OPCODE_PONG = 0xa;

export const WS_OPEN = 1;
export const WS_CLOSING = 2;
export const WS_CLOSED = 3;

export class SimpleWebSocket extends EventEmitter {
  private socket: Socket;
  private _readyState = WS_OPEN;
  private fragmentBuffer: Buffer[] = [];
  private fragmentOpcode: number | null = null;
  private parseBuffer = Buffer.alloc(0);

  // Expose constants as instance properties for compatibility
  readonly OPEN = WS_OPEN;
  readonly CLOSING = WS_CLOSING;
  readonly CLOSED = WS_CLOSED;

  constructor(socket: Socket) {
    super();
    this.socket = socket;

    socket.on("data", (data: Buffer) => {
      this.parseBuffer = Buffer.concat([this.parseBuffer, data]);
      this.processFrames();
    });

    socket.on("close", () => {
      this._readyState = WS_CLOSED;
      this.emit("close");
    });

    socket.on("error", (err) => {
      this.emit("error", err);
    });
  }

  get readyState(): number {
    return this._readyState;
  }

  send(data: string): void {
    if (this._readyState !== WS_OPEN) return;
    const payload = Buffer.from(data, "utf-8");
    this.writeFrame(OPCODE_TEXT, payload);
  }

  ping(): void {
    if (this._readyState !== WS_OPEN) return;
    this.writeFrame(OPCODE_PING, Buffer.alloc(0));
  }

  close(code?: number, reason?: string): void {
    if (this._readyState >= WS_CLOSING) return;
    this._readyState = WS_CLOSING;

    const payload = Buffer.alloc(2 + (reason ? Buffer.byteLength(reason) : 0));
    payload.writeUInt16BE(code ?? 1000, 0);
    if (reason) {
      payload.write(reason, 2, "utf-8");
    }
    this.writeFrame(OPCODE_CLOSE, payload);

    // Force close after timeout
    setTimeout(() => {
      if (this._readyState !== WS_CLOSED) {
        this.socket.destroy();
      }
    }, 5000);
  }

  private writeFrame(opcode: number, payload: Buffer): void {
    const length = payload.length;
    let header: Buffer;

    if (length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode; // FIN + opcode
      header[1] = length;
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      // Write as two 32-bit values since we don't need full 64-bit
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(length, 6);
    }

    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch {
      // Socket may already be destroyed
    }
  }

  private processFrames(): void {
    while (this.parseBuffer.length >= 2) {
      const firstByte = this.parseBuffer[0]!;
      const secondByte = this.parseBuffer[1]!;
      const fin = (firstByte & 0x80) !== 0;
      const opcode = firstByte & 0x0f;
      const masked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (this.parseBuffer.length < 4) return; // Need more data
        payloadLength = this.parseBuffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (this.parseBuffer.length < 10) return;
        // Read only the lower 32 bits (sufficient for our messages)
        payloadLength = this.parseBuffer.readUInt32BE(6);
        offset = 10;
      }

      if (masked) {
        offset += 4; // Mask key is 4 bytes
      }

      const totalLength = offset + payloadLength;
      if (this.parseBuffer.length < totalLength) return; // Need more data

      let payload = this.parseBuffer.subarray(offset, totalLength);

      if (masked) {
        const maskKey = this.parseBuffer.subarray(offset - 4, offset);
        payload = Buffer.from(payload); // Copy before unmasking
        for (let i = 0; i < payload.length; i++) {
          payload[i] = payload[i]! ^ maskKey[i % 4]!;
        }
      }

      // Consume this frame from the buffer
      this.parseBuffer = this.parseBuffer.subarray(totalLength);

      // Handle the frame
      this.handleFrame(fin, opcode, payload);
    }
  }

  private handleFrame(fin: boolean, opcode: number, payload: Buffer): void {
    if (opcode === OPCODE_CLOSE) {
      this._readyState = WS_CLOSED;
      // Echo close frame
      this.writeFrame(OPCODE_CLOSE, payload.subarray(0, Math.min(payload.length, 2)));
      this.socket.end();
      this.emit("close");
      return;
    }

    if (opcode === OPCODE_PING) {
      this.writeFrame(OPCODE_PONG, payload);
      return;
    }

    if (opcode === OPCODE_PONG) {
      this.emit("pong");
      return;
    }

    // Handle fragmentation
    if (opcode !== OPCODE_CONTINUATION) {
      this.fragmentOpcode = opcode;
      this.fragmentBuffer = [payload];
    } else {
      this.fragmentBuffer.push(payload);
    }

    if (fin) {
      const fullPayload = Buffer.concat(this.fragmentBuffer);
      this.fragmentBuffer = [];

      if (this.fragmentOpcode === OPCODE_TEXT) {
        this.emit("message", fullPayload.toString("utf-8"));
      } else if (this.fragmentOpcode === OPCODE_BINARY) {
        this.emit("message", fullPayload);
      }

      this.fragmentOpcode = null;
    }
  }
}

/**
 * Perform the WebSocket handshake on an HTTP upgrade request.
 * Returns a SimpleWebSocket if successful, null otherwise.
 */
export function upgradeToWebSocket(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  allowedPath?: string,
): SimpleWebSocket | null {
  // Verify the path if specified
  if (allowedPath) {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname !== allowedPath) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return null;
    }
  }

  // Verify WebSocket upgrade headers
  const upgradeHeader = req.headers.upgrade;
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return null;
  }

  const wsKey = req.headers["sec-websocket-key"];
  if (!wsKey) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return null;
  }

  // Compute accept key
  const acceptKey = createHash("sha1")
    .update(wsKey + WEBSOCKET_GUID)
    .digest("base64");

  // Send upgrade response
  const headers = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${acceptKey}`,
    "",
    "",
  ].join("\r\n");

  socket.write(headers);

  const ws = new SimpleWebSocket(socket);

  // Process any data already buffered in the head
  if (head.length > 0) {
    socket.unshift(head);
  }

  return ws;
}
