'use strict';

import { describe, it, expect, vi } from 'vitest';
import { YencDecoder } from '../src/services/yenc';
import { handleUsenetStreamRequest } from '../src/services/usenetStreamer';

describe('Usenet & yEnc Direct Stream Engine', () => {
  describe('1. YencDecoder Binary Decoding', () => {
    it('1.1 should decode a basic single-part yEnc buffer correctly', () => {
      // Original string: "Hello World" -> ASCII: [72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]
      // Encoded: (byte + 42) mod 256 -> [114, 143, 150, 150, 153, 74, 129, 153, 156, 150, 142]
      const header = Buffer.from('=ybegin line=128 size=11 name=test.txt\r\n');
      const body = Buffer.from([114, 143, 150, 150, 153, 74, 129, 153, 156, 150, 142]);
      const trailer = Buffer.from('\r\n=yend size=11 crc32=12345678\r\n');
      const rawBuf = Buffer.concat([header, body, trailer]);

      const decoded = YencDecoder.decode(rawBuf);
      expect(decoded.toString('utf8')).toBe('Hello World');
    });

    it('1.2 should decode multi-part yEnc buffer with =ypart header', () => {
      const header = Buffer.from('=ybegin part=1 total=2 line=128 size=20 name=test.bin\r\n=ypart begin=1 end=10\r\n');
      const body = Buffer.from([114, 143, 150, 150, 153]); // "Hello"
      const trailer = Buffer.from('\r\n=yend size=5 part=1\r\n');
      const rawBuf = Buffer.concat([header, body, trailer]);

      const decoded = YencDecoder.decode(rawBuf);
      expect(decoded.toString('utf8')).toBe('Hello');
    });

    it('1.3 should handle escaped characters with "=" correctly', () => {
      // Suppose original byte was 0x00 -> escaped in yEnc: '=' followed by (0 + 42 + 64) = 106 ('j')
      const header = Buffer.from('=ybegin line=128 size=1 name=test.bin\r\n');
      const body = Buffer.from([0x3d, 106]); // "=j"
      const trailer = Buffer.from('\r\n=yend size=1\r\n');
      const rawBuf = Buffer.concat([header, body, trailer]);

      const decoded = YencDecoder.decode(rawBuf);
      expect(decoded.length).toBe(1);
      expect(decoded[0]).toBe(0x00);
    });

    it('1.4 should handle empty or null buffer safely', () => {
      expect(YencDecoder.decode(null).length).toBe(0);
      expect(YencDecoder.decode(Buffer.alloc(0)).length).toBe(0);
    });
  });

  describe('2. Usenet HTTP 206 Stream Request Handler', () => {
    it('2.1 should set proper 206 Partial Content headers on Range requests', async () => {
      const mockReq = {
        headers: {
          range: 'bytes=100-299'
        },
        on: vi.fn()
      };

      const headersWritten = {};
      const mockRes = {
        writeHead: vi.fn((status, headers) => {
          Object.assign(headersWritten, { status, ...headers });
        }),
        write: vi.fn(),
        end: vi.fn(),
        headersSent: true,
        writableEnded: false
      };

      const metadata = {
        totalSize: 1000000,
        fileName: 'movie.mkv',
        segments: [
          { id: 'msg1@usenet', bytes: 500000 },
          { id: 'msg2@usenet', bytes: 500000 }
        ]
      };

      await handleUsenetStreamRequest(mockReq, mockRes, metadata);

      expect(mockRes.writeHead).toHaveBeenCalledWith(206, expect.objectContaining({
        'Content-Range': 'bytes 100-299/1000000',
        'Content-Length': 200,
        'Accept-Ranges': 'bytes'
      }));
    });

    it('2.2 should handle requests without range header starting from 0', async () => {
      const mockReq = {
        headers: {},
        on: vi.fn()
      };

      const mockRes = {
        writeHead: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        headersSent: true,
        writableEnded: false
      };

      const metadata = {
        totalSize: 500,
        fileName: 'test.mkv',
        segments: [{ id: 'msg1', bytes: 500 }]
      };

      await handleUsenetStreamRequest(mockReq, mockRes, metadata);

      expect(mockRes.writeHead).toHaveBeenCalledWith(206, expect.objectContaining({
        'Content-Range': 'bytes 0-499/500',
        'Content-Length': 500
      }));
    });
  });
});
