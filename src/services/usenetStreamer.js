'use strict';

const { YencDecoder } = require('./yenc');
const { NNTPClient } = require('./nntpClient');

/**
 * Handles HTTP 206 Partial Content Stream Request for Stremio Player
 * Calculates byte offset to segment index mapping and pipes decoded chunks directly.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Object} nzbMetadata - { segments: Array<{ id: string, bytes: number }>, totalSize: number, fileName: string }
 */
async function handleUsenetStreamRequest(req, res, nzbMetadata = {}) {
  const { segments = [], totalSize = 0, fileName = 'video.mkv' } = nzbMetadata;
  const rangeHeader = req.headers.range;

  const nntpConfig = {
    host: process.env.NNTP_HOST || 'news.newshosting.com',
    port: parseInt(process.env.NNTP_PORT || '563', 10),
    user: process.env.NNTP_USER || '',
    pass: process.env.NNTP_PASS || ''
  };

  let start = 0;
  let end = Math.max(0, totalSize - 1);

  if (rangeHeader && rangeHeader.startsWith('bytes=')) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    start = parseInt(parts[0], 10) || 0;
    if (parts[1] !== '' && parts[1] !== undefined) {
      end = parseInt(parts[1], 10);
    }
  }

  if (end >= totalSize && totalSize > 0) {
    end = totalSize - 1;
  }

  const chunkSize = Math.max(0, end - start + 1);

  // Set HTTP 206 Partial Content Headers
  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${totalSize}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': chunkSize,
    'Content-Type': 'video/x-matroska',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range, Origin, Accept, User-Agent',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });

  if (!segments || segments.length === 0 || chunkSize === 0) {
    return res.end();
  }

  // Calculate required segments by byte offset
  let currentByte = 0;
  let startSegIdx = -1;
  let endSegIdx = -1;
  let segStartOffset = 0;

  for (let i = 0; i < segments.length; i++) {
    const segSize = segments[i].bytes || 750000;
    const segEnd = currentByte + segSize - 1;

    if (start >= currentByte && start <= segEnd && startSegIdx === -1) {
      startSegIdx = i;
      segStartOffset = start - currentByte;
    }

    if (end >= currentByte && end <= segEnd) {
      endSegIdx = i;
      break;
    }
    currentByte += segSize;
  }

  if (startSegIdx === -1) startSegIdx = 0;
  if (endSegIdx === -1) endSegIdx = segments.length - 1;

  const client = new NNTPClient(nntpConfig);

  req.on('close', () => {
    client.destroy();
  });

  try {
    if (nntpConfig.user && nntpConfig.pass) {
      await client.connect();
    }

    let bytesDelivered = 0;

    for (let idx = startSegIdx; idx <= endSegIdx; idx++) {
      if (res.writableEnded || res.destroyed) break;

      const rawArticle = await client.fetchArticleBody(segments[idx].id);
      const decodedBuffer = YencDecoder.decode(rawArticle);

      let sliceStart = (idx === startSegIdx) ? segStartOffset : 0;
      let sliceEnd = decodedBuffer.length;

      const remainingNeeded = chunkSize - bytesDelivered;
      if (sliceEnd - sliceStart > remainingNeeded) {
        sliceEnd = sliceStart + remainingNeeded;
      }

      if (sliceEnd > sliceStart) {
        const chunkToPush = decodedBuffer.subarray(sliceStart, sliceEnd);
        res.write(chunkToPush);
        bytesDelivered += chunkToPush.length;
      }

      if (bytesDelivered >= chunkSize) break;
    }

    res.end();
  } catch (error) {
    console.error(`[Usenet Stream Error]: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).send('Stream error');
    } else {
      res.end();
    }
  } finally {
    client.destroy();
  }
}

module.exports = {
  handleUsenetStreamRequest,
  YencDecoder,
  NNTPClient
};
