'use strict';

const tls = require('tls');
const { EventEmitter } = require('events');

/**
 * NNTP Socket Client over TLS (Port 563)
 * Handles socket pooling, authentication, and article body streaming.
 */
class NNTPClient extends EventEmitter {
  constructor(config = {}) {
    super();
    this.host = config.host || process.env.NNTP_HOST || 'news.newshosting.com';
    this.port = parseInt(config.port || process.env.NNTP_PORT || '563', 10);
    this.user = config.user || process.env.NNTP_USER || '';
    this.pass = config.pass || process.env.NNTP_PASS || '';
    this.socket = null;
    this.connected = false;
    this.authenticated = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = tls.connect(
        {
          host: this.host,
          port: this.port,
          rejectUnauthorized: false
        },
        () => {
          this.connected = true;
        }
      );

      let buffer = '';

      const onData = (data) => {
        buffer += data.toString('latin1');
        if (buffer.includes('200') || buffer.includes('201')) {
          this.socket.removeListener('data', onData);
          if (this.user && this.pass) {
            this.authenticate().then(resolve).catch(reject);
          } else {
            resolve(true);
          }
        }
      };

      this.socket.on('data', onData);
      this.socket.on('error', (err) => reject(err));
    });
  }

  async authenticate() {
    await this.sendCommand(`AUTHINFO USER ${this.user}`);
    const res = await this.sendCommand(`AUTHINFO PASS ${this.pass}`);
    if (res.startsWith('281')) {
      this.authenticated = true;
      return true;
    }
    throw new Error(`NNTP Auth Failed: ${res}`);
  }

  sendCommand(cmd) {
    return new Promise((resolve, reject) => {
      this.socket.write(`${cmd}\r\n`);
      this.socket.once('data', (data) => {
        resolve(data.toString('latin1'));
      });
    });
  }

  /**
   * Fetches article body by Message-ID
   * @param {string} messageId
   * @returns {Promise<Buffer>}
   */
  fetchArticleBody(messageId) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const termPattern = Buffer.from('\r\n.\r\n');

      const onData = (chunk) => {
        chunks.push(chunk);
        const combinedLength = chunks.reduce((acc, cur) => acc + cur.length, 0);

        if (chunks.length > 0) {
          const lastChunk = chunks[chunks.length - 1];
          if (lastChunk.includes(termPattern) || lastChunk.subarray(-3).equals(Buffer.from('.\r\n'))) {
            this.socket.removeListener('data', onData);
            const totalBuf = Buffer.concat(chunks, combinedLength);
            resolve(totalBuf);
          }
        }
      };

      this.socket.on('data', onData);
      this.socket.on('error', (err) => reject(err));
      this.socket.write(`BODY <${messageId}>\r\n`);
    });
  }

  destroy() {
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch (_) {}
    }
  }
}

module.exports = { NNTPClient };
