'use strict';

const axios = require('axios');
const http  = require('http');

// ANSI Color codes
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';
const GRAY   = '\x1b[90m';

class TestRunner {
  constructor(suiteName = 'VIP Movies Addon Test Suite') {
    this.suiteName = suiteName;
    this.passed = 0;
    this.failed = 0;
    this.warned = 0;
    this.skipped = 0;
    this.failures = [];
    this.currentSection = '';
  }

  section(name) {
    this.currentSection = name;
    console.log(`\n${BOLD}${CYAN}══ ${name} ══${RESET}`);
  }

  pass(label) {
    console.log(`  ${GREEN}✅ PASS${RESET} ${label}`);
    this.passed++;
  }

  fail(label, error) {
    const errMsg = error ? (error.stack || error.message || String(error)) : '';
    console.log(`  ${RED}❌ FAIL${RESET} ${label}`);
    if (errMsg) {
      console.log(`     ${GRAY}${errMsg.split('\n')[0]}${RESET}`);
    }
    this.failed++;
    this.failures.push({
      section: this.currentSection,
      label,
      error: errMsg,
    });
  }

  warn(label) {
    console.log(`  ${YELLOW}⚠️  WARN${RESET} ${label}`);
    this.warned++;
  }

  info(label) {
    console.log(`  ${GRAY}ℹ️  ${label}${RESET}`);
  }

  assert(condition, label, customErr) {
    if (condition) {
      this.pass(label);
      return true;
    } else {
      this.fail(label, customErr || new Error('Assertion failed: condition is false'));
      return false;
    }
  }

  assertEqual(actual, expected, label) {
    if (actual === expected) {
      this.pass(`${label} (== ${expected})`);
      return true;
    } else {
      this.fail(`${label} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
      return false;
    }
  }

  assertIncludes(str, sub, label) {
    const contains = str != null && String(str).includes(sub);
    if (contains) {
      this.pass(label || `String contains "${sub}"`);
      return true;
    } else {
      this.fail(label || `String missing "${sub}"`, new Error(`Expected to find "${sub}" in: "${String(str).slice(0, 100)}..."`));
      return false;
    }
  }

  /**
   * Validate Stremio Protocol Stream Exclusivity Contract (Interface Contract §3)
   * - In-App Direct Play (HLS Proxy): has `url` and NO `externalUrl`
   * - External Browser Play (Embed Player): has `externalUrl` and NO `url`
   */
  assertStreamProtocol(stream, index = 0) {
    const label = `Stream #${index + 1} (${stream.name || 'unnamed'} - ${(stream.title || '').replace(/\n/g, ' ')})`;
    
    // 1. Must have a valid name
    if (!stream.name) {
      this.fail(`${label}: missing 'name' property`);
      return false;
    }

    const hasUrl = typeof stream.url === 'string' && stream.url.trim().length > 0;
    const hasExternalUrl = typeof stream.externalUrl === 'string' && stream.externalUrl.trim().length > 0;

    // 2. Cannot have both url and externalUrl
    if (hasUrl && hasExternalUrl) {
      this.fail(`${label}: PROTOCOL VIOLATION - Stream has BOTH 'url' and 'externalUrl' properties! (HLS and Embed must be strictly exclusive)`);
      return false;
    }

    // 3. Cannot have neither
    if (!hasUrl && !hasExternalUrl) {
      this.fail(`${label}: PROTOCOL VIOLATION - Stream has NEITHER 'url' nor 'externalUrl'`);
      return false;
    }

    // 4. If HLS Proxy: externalUrl MUST NOT exist on object
    if (hasUrl) {
      if ('externalUrl' in stream && stream.externalUrl !== undefined) {
        this.fail(`${label}: HLS Proxy stream has defined 'externalUrl' property`);
        return false;
      }
      this.pass(`${label}: Valid In-App HLS Proxy stream (has 'url', no 'externalUrl')`);
      return true;
    }

    // 5. If Embed Player: url MUST NOT exist on object
    if (hasExternalUrl) {
      if ('url' in stream && stream.url !== undefined) {
        this.fail(`${label}: Embed Player stream has defined 'url' property`);
        return false;
      }
      this.pass(`${label}: Valid External Embed Player stream (has 'externalUrl', no 'url')`);
      return true;
    }

    return true;
  }

  printSummary() {
    const total = this.passed + this.failed;
    console.log(`\n${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}║                   TEST EXECUTION SUMMARY                     ║${RESET}`);
    console.log(`${BOLD}╠══════════════════════════════════════════════════════════════╣${RESET}`);
    console.log(`║  Total Assertions: ${String(total).padEnd(41)}║`);
    console.log(`║  ${GREEN}✅ Passed:         ${String(this.passed).padEnd(41)}${RESET}║`);
    console.log(`║  ${YELLOW}⚠️  Warnings:       ${String(this.warned).padEnd(41)}${RESET}║`);
    console.log(`║  ${RED}❌ Failed:         ${String(this.failed).padEnd(41)}${RESET}║`);
    console.log(`${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}\n`);

    if (this.failures.length > 0) {
      console.log(`${BOLD}${RED}FAILED ASSERTIONS DETAIL:${RESET}`);
      this.failures.forEach((f, i) => {
        console.log(`  ${i + 1}. [${f.section}] ${f.label}`);
        if (f.error) console.log(`     Error: ${f.error}`);
      });
      console.log('');
    }
  }
}

/**
 * Start the test express application on a designated test port
 */
async function startTestServer(port = 7399) {
  process.env.PORT = String(port);
  const app = require('../src/index.js');
  // Allow server to bind and listen
  await new Promise((resolve) => setTimeout(resolve, 800));
  const baseUrl = `http://localhost:${port}`;
  return { app, baseUrl, port };
}

module.exports = {
  TestRunner,
  startTestServer,
  GREEN,
  RED,
  YELLOW,
  CYAN,
  RESET,
  BOLD,
  GRAY,
};
