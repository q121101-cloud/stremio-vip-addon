'use strict';

/**
 * High-Performance In-Memory yEnc Binary Decoder
 * Decodes yEnc encoded articles directly from Buffer to Buffer with Zero Disk I/O.
 */
class YencDecoder {
  /**
   * Decodes a raw yEnc Buffer into original binary data
   * @param {Buffer} rawBuffer
   * @returns {Buffer}
   */
  static decode(rawBuffer) {
    if (!rawBuffer || !Buffer.isBuffer(rawBuffer) || rawBuffer.length === 0) {
      return Buffer.alloc(0);
    }

    const len = rawBuffer.length;

    // 1. Locate end of header (=ybegin or =ypart)
    let headerEnd = -1;
    for (let i = 0; i < len - 6; i++) {
      if (
        rawBuffer[i] === 0x3d && // '='
        rawBuffer[i + 1] === 0x79 && // 'y'
        rawBuffer[i + 2] === 0x62 && // 'b'
        rawBuffer[i + 3] === 0x65 && // 'e'
        rawBuffer[i + 4] === 0x67 && // 'g'
        rawBuffer[i + 5] === 0x69 // 'i'
      ) {
        // Find line feed '\n' ending header
        for (let j = i; j < len; j++) {
          if (rawBuffer[j] === 0x0a) {
            // Check if there is an immediately following =ypart header line
            if (
              j + 6 < len &&
              rawBuffer[j + 1] === 0x3d &&
              rawBuffer[j + 2] === 0x79 &&
              rawBuffer[j + 3] === 0x70 // 'p'
            ) {
              for (let k = j + 1; k < len; k++) {
                if (rawBuffer[k] === 0x0a) {
                  headerEnd = k + 1;
                  break;
                }
              }
            } else {
              headerEnd = j + 1;
            }
            break;
          }
        }
        break;
      }
    }

    if (headerEnd === -1) {
      headerEnd = 0; // Fallback if no standard header
    }

    // 2. Allocate output Buffer (maximum size equal to input)
    const output = Buffer.allocUnsafe(len);
    let outIdx = 0;
    let isEscaped = false;

    // 3. Binary decode loop
    for (let i = headerEnd; i < len; i++) {
      const b = rawBuffer[i];

      // Skip CR and LF
      if (b === 0x0d || b === 0x0a) continue;

      // Check trailer =yend to terminate segment parsing
      if (
        b === 0x3d &&
        i + 5 < len &&
        rawBuffer[i + 1] === 0x79 &&
        rawBuffer[i + 2] === 0x65 &&
        rawBuffer[i + 3] === 0x6e &&
        rawBuffer[i + 4] === 0x64 // '=yend'
      ) {
        break;
      }

      // Handle escape character '='
      if (b === 0x3d && !isEscaped) {
        isEscaped = true;
        continue;
      }

      if (isEscaped) {
        output[outIdx++] = (b - 42 - 64) & 255;
        isEscaped = false;
      } else {
        output[outIdx++] = (b - 42) & 255;
      }
    }

    // Return slice with exact decoded size
    return output.subarray(0, outIdx);
  }
}

module.exports = { YencDecoder };
