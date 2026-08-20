'use strict';

/**
 * 1-Click Smart TV Installation Modal & Authentic Self-Contained ISO/IEC 18004 QR Code Model 2 Engine
 * Zero external runtime/CDN dependencies. 100% Pure JavaScript.
 */
(function (global) {

  // =========================================================================
  // 1. Galois Field GF(2^8) Arithmetic & Reed-Solomon ECC Engine
  // =========================================================================
  var EXP = new Uint8Array(512);
  var LOG = new Uint8Array(256);
  (function initGF() {
    var val = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = val;
      EXP[i + 255] = val;
      LOG[val] = i;
      val <<= 1;
      if (val & 256) val ^= 0x11D; // Primitive polynomial: x^8 + x^4 + x^3 + x^2 + 1 (285)
    }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function getRsGeneratorPoly(degree) {
    var poly = [1];
    for (var i = 0; i < degree; i++) {
      var next = new Array(poly.length + 1).fill(0);
      var root = EXP[i];
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], root);
      }
      poly = next;
    }
    return poly;
  }

  function computeRsCodewords(data, ecCount) {
    var gen = getRsGeneratorPoly(ecCount);
    var ec = new Uint8Array(ecCount);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ ec[0];
      for (var j = 0; j < ecCount - 1; j++) {
        ec[j] = ec[j + 1];
      }
      ec[ecCount - 1] = 0;
      for (var j = 0; j < ecCount; j++) {
        ec[j] ^= gfMul(gen[j + 1], factor);
      }
    }
    return ec;
  }

  // =========================================================================
  // 2. ISO/IEC 18004 Specification Table for Versions 1 through 10
  // =========================================================================
  var QR_SPECS = [
    null,
    // V1 (21x21)
    { version: 1, size: 21, remainderBits: 0, alignCoords: [], ecLevels: {
      L: { totalData: 19, ecPerBlock: 7, blocks: [{ count: 1, dataPerBlock: 19 }] },
      M: { totalData: 16, ecPerBlock: 10, blocks: [{ count: 1, dataPerBlock: 16 }] },
      Q: { totalData: 13, ecPerBlock: 13, blocks: [{ count: 1, dataPerBlock: 13 }] },
      H: { totalData: 9, ecPerBlock: 17, blocks: [{ count: 1, dataPerBlock: 9 }] }
    }},
    // V2 (25x25)
    { version: 2, size: 25, remainderBits: 7, alignCoords: [6, 18], ecLevels: {
      L: { totalData: 34, ecPerBlock: 10, blocks: [{ count: 1, dataPerBlock: 34 }] },
      M: { totalData: 28, ecPerBlock: 16, blocks: [{ count: 1, dataPerBlock: 28 }] },
      Q: { totalData: 22, ecPerBlock: 22, blocks: [{ count: 1, dataPerBlock: 22 }] },
      H: { totalData: 16, ecPerBlock: 28, blocks: [{ count: 1, dataPerBlock: 16 }] }
    }},
    // V3 (29x29)
    { version: 3, size: 29, remainderBits: 7, alignCoords: [6, 22], ecLevels: {
      L: { totalData: 55, ecPerBlock: 15, blocks: [{ count: 1, dataPerBlock: 55 }] },
      M: { totalData: 44, ecPerBlock: 26, blocks: [{ count: 1, dataPerBlock: 44 }] },
      Q: { totalData: 34, ecPerBlock: 18, blocks: [{ count: 2, dataPerBlock: 17 }] },
      H: { totalData: 26, ecPerBlock: 22, blocks: [{ count: 2, dataPerBlock: 13 }] }
    }},
    // V4 (33x33)
    { version: 4, size: 33, remainderBits: 7, alignCoords: [6, 26], ecLevels: {
      L: { totalData: 80, ecPerBlock: 20, blocks: [{ count: 1, dataPerBlock: 80 }] },
      M: { totalData: 64, ecPerBlock: 18, blocks: [{ count: 2, dataPerBlock: 32 }] },
      Q: { totalData: 48, ecPerBlock: 26, blocks: [{ count: 2, dataPerBlock: 24 }] },
      H: { totalData: 36, ecPerBlock: 16, blocks: [{ count: 4, dataPerBlock: 9 }] }
    }},
    // V5 (37x37)
    { version: 5, size: 37, remainderBits: 7, alignCoords: [6, 30], ecLevels: {
      L: { totalData: 108, ecPerBlock: 26, blocks: [{ count: 1, dataPerBlock: 108 }] },
      M: { totalData: 86, ecPerBlock: 24, blocks: [{ count: 2, dataPerBlock: 43 }] },
      Q: { totalData: 62, ecPerBlock: 18, blocks: [{ count: 2, dataPerBlock: 15 }, { count: 2, dataPerBlock: 16 }] },
      H: { totalData: 46, ecPerBlock: 22, blocks: [{ count: 2, dataPerBlock: 11 }, { count: 2, dataPerBlock: 12 }] }
    }},
    // V6 (41x41)
    { version: 6, size: 41, remainderBits: 7, alignCoords: [6, 34], ecLevels: {
      L: { totalData: 136, ecPerBlock: 18, blocks: [{ count: 2, dataPerBlock: 68 }] },
      M: { totalData: 108, ecPerBlock: 16, blocks: [{ count: 4, dataPerBlock: 27 }] },
      Q: { totalData: 76, ecPerBlock: 24, blocks: [{ count: 4, dataPerBlock: 19 }] },
      H: { totalData: 60, ecPerBlock: 28, blocks: [{ count: 4, dataPerBlock: 15 }] }
    }},
    // V7 (45x45)
    { version: 7, size: 45, remainderBits: 0, alignCoords: [6, 22, 38], ecLevels: {
      L: { totalData: 156, ecPerBlock: 20, blocks: [{ count: 2, dataPerBlock: 78 }] },
      M: { totalData: 124, ecPerBlock: 18, blocks: [{ count: 4, dataPerBlock: 31 }] },
      Q: { totalData: 88, ecPerBlock: 18, blocks: [{ count: 2, dataPerBlock: 14 }, { count: 4, dataPerBlock: 15 }] },
      H: { totalData: 66, ecPerBlock: 26, blocks: [{ count: 4, dataPerBlock: 13 }, { count: 1, dataPerBlock: 14 }] }
    }},
    // V8 (49x49)
    { version: 8, size: 49, remainderBits: 0, alignCoords: [6, 24, 42], ecLevels: {
      L: { totalData: 194, ecPerBlock: 24, blocks: [{ count: 2, dataPerBlock: 97 }] },
      M: { totalData: 154, ecPerBlock: 22, blocks: [{ count: 2, dataPerBlock: 38 }, { count: 2, dataPerBlock: 39 }] },
      Q: { totalData: 110, ecPerBlock: 22, blocks: [{ count: 4, dataPerBlock: 18 }, { count: 2, dataPerBlock: 19 }] },
      H: { totalData: 86, ecPerBlock: 26, blocks: [{ count: 4, dataPerBlock: 14 }, { count: 2, dataPerBlock: 15 }] }
    }},
    // V9 (53x53)
    { version: 9, size: 53, remainderBits: 0, alignCoords: [6, 26, 46], ecLevels: {
      L: { totalData: 232, ecPerBlock: 30, blocks: [{ count: 2, dataPerBlock: 116 }] },
      M: { totalData: 182, ecPerBlock: 22, blocks: [{ count: 3, dataPerBlock: 36 }, { count: 2, dataPerBlock: 37 }] },
      Q: { totalData: 132, ecPerBlock: 20, blocks: [{ count: 4, dataPerBlock: 16 }, { count: 4, dataPerBlock: 17 }] },
      H: { totalData: 100, ecPerBlock: 24, blocks: [{ count: 4, dataPerBlock: 12 }, { count: 4, dataPerBlock: 13 }] }
    }},
    // V10 (57x57)
    { version: 10, size: 57, remainderBits: 0, alignCoords: [6, 28, 50], ecLevels: {
      L: { totalData: 274, ecPerBlock: 18, blocks: [{ count: 2, dataPerBlock: 68 }, { count: 2, dataPerBlock: 69 }] },
      M: { totalData: 216, ecPerBlock: 26, blocks: [{ count: 4, dataPerBlock: 43 }, { count: 1, dataPerBlock: 44 }] },
      Q: { totalData: 154, ecPerBlock: 24, blocks: [{ count: 6, dataPerBlock: 19 }, { count: 2, dataPerBlock: 20 }] },
      H: { totalData: 122, ecPerBlock: 28, blocks: [{ count: 6, dataPerBlock: 15 }, { count: 2, dataPerBlock: 16 }] }
    }}
  ];

  // Helper: UTF-8 String to Byte Array
  function stringToUtf8Bytes(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
      } else if (code < 0xD800 || code >= 0xE000) {
        bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
      } else {
        i++;
        code = 0x10000 + (((code & 0x3FF) << 10) | (str.charCodeAt(i) & 0x3FF));
        bytes.push(
          0xF0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3F),
          0x80 | ((code >> 6) & 0x3F),
          0x80 | (code & 0x3F)
        );
      }
    }
    return bytes;
  }

  // BitBuffer helper
  function BitBuffer() {
    this.buffer = [];
    this.length = 0;
  }
  BitBuffer.prototype.put = function (num, length) {
    for (var i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  };
  BitBuffer.prototype.putBit = function (bit) {
    var bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) this.buffer.push(0);
    if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
    this.length++;
  };
  BitBuffer.prototype.getBytes = function () {
    return this.buffer;
  };

  // BCH(15, 5) Format Information calculation
  function getFormatInfoBits(eccLevelChar, maskPattern) {
    var ECC_INDICATORS = { M: 0, L: 1, H: 2, Q: 3 };
    var eccIndicator = ECC_INDICATORS[eccLevelChar] !== undefined ? ECC_INDICATORS[eccLevelChar] : 1;
    var data = (eccIndicator << 3) | maskPattern;
    var d = data << 10;
    var G = 0x537;
    for (var i = 4; i >= 0; i--) {
      if ((d >> (i + 10)) & 1) d ^= (G << i);
    }
    return ((data << 10) | d) ^ 0x5412;
  }

  // BCH(18, 6) Version Information calculation (V >= 7)
  function getVersionInfoBits(version) {
    var d = version << 12;
    var G = 0x1F25;
    for (var i = 5; i >= 0; i--) {
      if ((d >> (i + 12)) & 1) d ^= (G << i);
    }
    return (version << 12) | d;
  }

  // Mask Pattern Functions (0..7)
  var MASK_FNS = [
    function (r, c) { return (r + c) % 2 === 0; },
    function (r, c) { return r % 2 === 0; },
    function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return ((r * c) % 2) + ((r * c) % 3) === 0; },
    function (r, c) { return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; },
    function (r, c) { return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; }
  ];

  // Penalty Scoring (N1, N2, N3, N4)
  function evaluatePenalty(grid, size) {
    var penalty = 0;
    // N1: 5+ consecutive modules
    for (var r = 0; r < size; r++) {
      var count = 0, last = null;
      for (var c = 0; c < size; c++) {
        if (grid[r][c] === last) count++;
        else {
          if (count >= 5) penalty += 3 + (count - 5);
          last = grid[r][c]; count = 1;
        }
      }
      if (count >= 5) penalty += 3 + (count - 5);
    }
    for (var c = 0; c < size; c++) {
      var count = 0, last = null;
      for (var r = 0; r < size; r++) {
        if (grid[r][c] === last) count++;
        else {
          if (count >= 5) penalty += 3 + (count - 5);
          last = grid[r][c]; count = 1;
        }
      }
      if (count >= 5) penalty += 3 + (count - 5);
    }
    // N2: 2x2 blocks of same color
    for (var r = 0; r < size - 1; r++) {
      for (var c = 0; c < size - 1; c++) {
        var val = grid[r][c];
        if (grid[r + 1][c] === val && grid[r][c + 1] === val && grid[r + 1][c + 1] === val) {
          penalty += 3;
        }
      }
    }
    // N3: 1:1:3:1:1 pattern
    var p1 = [true, false, true, true, true, false, true, false, false, false, false];
    var p2 = [false, false, false, false, true, false, true, true, true, false, true];
    for (var r = 0; r < size; r++) {
      for (var c = 0; c <= size - 11; c++) {
        var m1 = true, m2 = true;
        for (var k = 0; k < 11; k++) {
          if (grid[r][c + k] !== p1[k]) m1 = false;
          if (grid[r][c + k] !== p2[k]) m2 = false;
        }
        if (m1 || m2) penalty += 40;
      }
    }
    for (var c = 0; c < size; c++) {
      for (var r = 0; r <= size - 11; r++) {
        var m1 = true, m2 = true;
        for (var k = 0; k < 11; k++) {
          if (grid[r + k][c] !== p1[k]) m1 = false;
          if (grid[r + k][c] !== p2[k]) m2 = false;
        }
        if (m1 || m2) penalty += 40;
      }
    }
    // N4: Dark module ratio
    var darkCount = 0;
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        if (grid[r][c]) darkCount++;
      }
    }
    var ratio = (darkCount / (size * size)) * 100;
    var prev5 = Math.floor(ratio / 5) * 5;
    var next5 = prev5 + 5;
    var devPrev = Math.abs(prev5 - 50) / 5;
    var devNext = Math.abs(next5 - 50) / 5;
    penalty += Math.min(devPrev, devNext) * 10;
    return penalty;
  }

  // Core ISO/IEC 18004 QR Encoder
  function encodeQRCode(text, preferredEcc) {
    if (preferredEcc === undefined) preferredEcc = 'M';
    var utf8Bytes = stringToUtf8Bytes(text || '');
    var dataLen = utf8Bytes.length;

    var targetVersion = 0;
    var targetSpec = null;
    var actualEcc = preferredEcc;

    var eccCandidates = [preferredEcc];
    if (preferredEcc !== 'L') eccCandidates.push('L');

    for (var e = 0; e < eccCandidates.length; e++) {
      var ecc = eccCandidates[e];
      for (var v = 1; v <= 10; v++) {
        var spec = QR_SPECS[v];
        var totalData = spec.ecLevels[ecc].totalData;
        var headerBits = 4 + (v < 10 ? 8 : 16);
        var requiredBytes = Math.ceil((headerBits + dataLen * 8) / 8);
        if (requiredBytes <= totalData) {
          targetVersion = v;
          targetSpec = spec;
          actualEcc = ecc;
          break;
        }
      }
      if (targetSpec) break;
    }

    if (!targetSpec) {
      throw new Error('Data payload too large for QR Model 2 (Versions 1-10): length ' + dataLen);
    }

    var ecSpec = targetSpec.ecLevels[actualEcc];
    var maxDataCodewords = ecSpec.totalData;

    // Bitstream assembly: Mode indicator (0100) + Char count + data
    var bb = new BitBuffer();
    bb.put(4, 4);
    var charCountBits = targetVersion < 10 ? 8 : 16;
    bb.put(dataLen, charCountBits);
    for (var i = 0; i < dataLen; i++) {
      bb.put(utf8Bytes[i], 8);
    }

    // Terminator (up to 4 bits of 0)
    var maxBits = maxDataCodewords * 8;
    var remBits = maxBits - bb.length;
    if (remBits > 0) bb.put(0, Math.min(4, remBits));

    // Pad to byte boundary
    if (bb.length % 8 !== 0) bb.put(0, 8 - (bb.length % 8));

    // Pad bytes: 0xEC, 0x11 alternating
    var rawBytes = bb.getBytes();
    var padToggle = 0;
    while (rawBytes.length < maxDataCodewords) {
      rawBytes.push(padToggle === 0 ? 0xEC : 0x11);
      padToggle ^= 1;
    }

    // Block division & RS Error Correction
    var blocks = [];
    var byteOffset = 0;
    for (var bi = 0; bi < ecSpec.blocks.length; bi++) {
      var blockInfo = ecSpec.blocks[bi];
      for (var b = 0; b < blockInfo.count; b++) {
        var dataBlock = rawBytes.slice(byteOffset, byteOffset + blockInfo.dataPerBlock);
        byteOffset += blockInfo.dataPerBlock;
        var ecBlock = computeRsCodewords(dataBlock, ecSpec.ecPerBlock);
        blocks.push({ data: dataBlock, ec: ecBlock });
      }
    }

    // Interleaving
    var finalCodewords = [];
    var maxBlockDataLen = 0;
    for (var b = 0; b < blocks.length; b++) {
      if (blocks[b].data.length > maxBlockDataLen) maxBlockDataLen = blocks[b].data.length;
    }
    for (var i = 0; i < maxBlockDataLen; i++) {
      for (var b = 0; b < blocks.length; b++) {
        if (i < blocks[b].data.length) finalCodewords.push(blocks[b].data[i]);
      }
    }
    for (var i = 0; i < ecSpec.ecPerBlock; i++) {
      for (var b = 0; b < blocks.length; b++) {
        finalCodewords.push(blocks[b].ec[i]);
      }
    }

    // Matrix construction
    var size = targetSpec.size;
    var matrix = Array.from({ length: size }, function () { return new Array(size).fill(false); });
    var isReserved = Array.from({ length: size }, function () { return new Array(size).fill(false); });

    function setModule(r, c, val, reserved) {
      matrix[r][c] = !!val;
      if (reserved) isReserved[r][c] = true;
    }

    function drawFinder(row, col) {
      for (var r = -1; r <= 7; r++) {
        for (var c = -1; c <= 7; c++) {
          var mr = row + r, mc = col + c;
          if (mr < 0 || mr >= size || mc < 0 || mc >= size) continue;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            var isBlack = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
            setModule(mr, mc, isBlack, true);
          } else {
            setModule(mr, mc, false, true);
          }
        }
      }
    }

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Timing patterns
    for (var i = 8; i < size - 8; i++) {
      var isBlack = (i % 2 === 0);
      if (!isReserved[6][i]) setModule(6, i, isBlack, true);
      if (!isReserved[i][6]) setModule(i, 6, isBlack, true);
    }

    // Alignment patterns
    var alignCoords = targetSpec.alignCoords;
    for (var i = 0; i < alignCoords.length; i++) {
      for (var j = 0; j < alignCoords.length; j++) {
        var ar = alignCoords[i], ac = alignCoords[j];
        if ((ar <= 8 && ac <= 8) || (ar <= 8 && ac >= size - 8) || (ar >= size - 8 && ac <= 8)) continue;
        for (var r = -2; r <= 2; r++) {
          for (var c = -2; c <= 2; c++) {
            var isBlack = (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0));
            setModule(ar + r, ac + c, isBlack, true);
          }
        }
      }
    }

    // Dark Module
    setModule(size - 8, 8, true, true);

    // Reserve Format info areas
    for (var i = 0; i <= 8; i++) {
      if (i !== 6) isReserved[8][i] = true;
      if (i !== 6) isReserved[i][8] = true;
    }
    for (var i = 0; i < 8; i++) isReserved[8][size - 1 - i] = true;
    for (var i = 0; i < 8; i++) isReserved[size - 1 - i][8] = true;

    // Reserve Version info areas (V >= 7)
    if (targetVersion >= 7) {
      for (var r = 0; r < 6; r++) {
        for (var c = 0; c < 3; c++) {
          isReserved[r][size - 11 + c] = true;
          isReserved[size - 11 + c][r] = true;
        }
      }
    }

    // Zigzag bit placement
    var dataBits = [];
    for (var b = 0; b < finalCodewords.length; b++) {
      var byte = finalCodewords[b];
      for (var s = 7; s >= 0; s--) dataBits.push(((byte >>> s) & 1) === 1);
    }
    for (var i = 0; i < targetSpec.remainderBits; i++) dataBits.push(false);

    var bitIdx = 0;
    var dir = -1;
    var currC = size - 1;

    while (currC > 0) {
      if (currC === 6) currC--;
      for (var rowStep = 0; rowStep < size; rowStep++) {
        var currRow = dir === -1 ? size - 1 - rowStep : rowStep;
        for (var colOffset = 0; colOffset < 2; colOffset++) {
          var targetCol = currC - colOffset;
          if (!isReserved[currRow][targetCol]) {
            var bitVal = bitIdx < dataBits.length ? dataBits[bitIdx] : false;
            matrix[currRow][targetCol] = bitVal;
            bitIdx++;
          }
        }
      }
      dir = -dir;
      currC -= 2;
    }

    // Mask evaluation
    var bestMask = 0;
    var bestPenalty = Infinity;
    var bestGrid = null;

    for (var m = 0; m < 8; m++) {
      var maskFn = MASK_FNS[m];
      var candidateGrid = Array.from({ length: size }, function (_, r) {
        return Array.from({ length: size }, function (_, c) {
          if (isReserved[r][c]) return matrix[r][c];
          return maskFn(r, c) ? !matrix[r][c] : matrix[r][c];
        });
      });

      var fmtBits = getFormatInfoBits(actualEcc, m);
      var tlCoords = [
        [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
        [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
      ];
      for (var i = 0; i < 15; i++) {
        var bit = ((fmtBits >>> (14 - i)) & 1) === 1;
        var fr = tlCoords[i][0], fc = tlCoords[i][1];
        candidateGrid[fr][fc] = bit;
      }
      for (var i = 0; i < 7; i++) {
        var bit = ((fmtBits >>> i) & 1) === 1;
        candidateGrid[size - 1 - i][8] = bit;
      }
      for (var i = 0; i < 8; i++) {
        var bit = ((fmtBits >>> (i + 7)) & 1) === 1;
        candidateGrid[8][size - 8 + i] = bit;
      }

      if (targetVersion >= 7) {
        var vBits = getVersionInfoBits(targetVersion);
        for (var i = 0; i < 18; i++) {
          var bit = ((vBits >>> i) & 1) === 1;
          var row = Math.floor(i / 3);
          var col = i % 3;
          candidateGrid[row][size - 11 + col] = bit;
          candidateGrid[size - 11 + col][row] = bit;
        }
      }

      var penalty = evaluatePenalty(candidateGrid, size);
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestMask = m;
        bestGrid = candidateGrid;
      }
    }

    return {
      version: targetVersion,
      ecc: actualEcc,
      size: size,
      mask: bestMask,
      penalty: bestPenalty,
      modules: bestGrid,
      grid: bestGrid,
      rawBytes: rawBytes,
      finalCodewords: finalCodewords
    };
  }

  // Matrix generation wrapper (returns 2D array of booleans)
  function createQRCodeMatrix(text, ecLevel) {
    var qr = encodeQRCode(text || 'https://stremio.com', ecLevel || 'M');
    return qr.modules;
  }

  // Matrix builder alias for object structure
  function buildQRMatrix(text, ecLevel) {
    var qr = encodeQRCode(text || 'https://stremio.com', ecLevel || 'M');
    return {
      version: qr.version,
      ecc: qr.ecc,
      size: qr.size,
      mask: qr.mask,
      penalty: qr.penalty,
      grid: qr.modules,
      modules: qr.modules
    };
  }

  // =========================================================================
  // 3. Canvas Rendering Engine
  // =========================================================================
  function generateQRCodeCanvas(text, canvas, options) {
    if (!canvas || !canvas.getContext) return null;
    options = options || {};
    var ctx = canvas.getContext('2d');
    var width = canvas.width || 220;
    var height = canvas.height || 220;

    var darkColor = options.darkColor || '#07090e';
    var lightColor = options.lightColor || '#ffffff';
    var quietZone = typeof options.quietZone === 'number' ? options.quietZone : 2;
    var ecLevel = options.ecLevel || 'M';

    // Clear canvas with crisp white background
    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, width, height);

    var qr = encodeQRCode(text || 'https://stremio.com', ecLevel);
    var numModules = qr.size;
    var totalGrid = numModules + quietZone * 2;
    var cellSize = Math.max(1, Math.floor(Math.min(width, height) / totalGrid));
    var offsetX = Math.floor((width - (numModules * cellSize)) / 2);
    var offsetY = Math.floor((height - (numModules * cellSize)) / 2);

    ctx.fillStyle = darkColor;
    for (var r = 0; r < numModules; r++) {
      for (var c = 0; c < numModules; c++) {
        if (qr.modules[r][c]) {
          ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
        }
      }
    }

    return qr;
  }

  // =========================================================================
  // 4. Modal Lifecycle & UI Navigation Controller
  // =========================================================================
  var QRModal = {
    modalEl: null,
    canvasEl: null,
    currentUrl: '',

    init: function () {
      if (typeof document === 'undefined') return;
      this.modalEl = document.getElementById('qr-modal');
      this.canvasEl = document.getElementById('qr-canvas');
      var closeBtn = document.getElementById('btn-close-modal');

      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.close());
      }

      if (this.modalEl) {
        this.modalEl.addEventListener('click', (e) => {
          if (e.target === this.modalEl) {
            this.close();
          }
        });
      }

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.modalEl && this.modalEl.classList.contains('open')) {
          this.close();
        }
      });

      var tabButtons = document.querySelectorAll('.tab-btn');
      var tabContents = document.querySelectorAll('.tab-content');

      tabButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var targetTabId = btn.getAttribute('data-tab');
          tabButtons.forEach(function (b) {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
          });
          tabContents.forEach(function (c) { c.classList.remove('active'); });

          btn.classList.add('active');
          btn.setAttribute('aria-selected', 'true');
          var targetContent = document.getElementById(targetTabId);
          if (targetContent) targetContent.classList.add('active');
        });
      });
    },

    open: function (url) {
      if (!this.modalEl) this.init();
      this.currentUrl = url || this.currentUrl;
      this.renderQR(this.currentUrl);
      if (this.modalEl) {
        this.modalEl.classList.add('open');
        this.modalEl.setAttribute('aria-hidden', 'false');
      }
    },

    close: function () {
      if (!this.modalEl) return;
      this.modalEl.classList.remove('open');
      this.modalEl.setAttribute('aria-hidden', 'true');
    },

    renderQR: function (url) {
      if (!this.canvasEl && typeof document !== 'undefined') {
        this.canvasEl = document.getElementById('qr-canvas');
      }
      if (this.canvasEl && url) {
        generateQRCodeCanvas(url, this.canvasEl);
      }
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      QRModal.init();
    });
  }

  // Global browser exports
  global.QRModal = QRModal;
  global.generateQRCodeCanvas = generateQRCodeCanvas;
  global.encodeQRCode = encodeQRCode;
  global.createQRCodeMatrix = createQRCodeMatrix;
  global.buildQRMatrix = buildQRMatrix;

  // Node.js CommonJS exports
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      QRModal: QRModal,
      generateQRCodeCanvas: generateQRCodeCanvas,
      encodeQRCode: encodeQRCode,
      createQRCodeMatrix: createQRCodeMatrix,
      buildQRMatrix: buildQRMatrix,
      getFormatInfoBits: getFormatInfoBits,
      getVersionInfoBits: getVersionInfoBits,
      computeRsCodewords: computeRsCodewords,
      computeReedSolomonECC: computeRsCodewords,
      QR_SPECS: QR_SPECS
    };
  }
})(typeof window !== 'undefined' ? window : global);
