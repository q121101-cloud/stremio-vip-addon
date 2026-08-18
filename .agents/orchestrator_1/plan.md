# Orchestrator Plan — Stremio VIP Movies Addon Engine v1.7.0 Overhaul

## Overview
Comprehensive upgrade of the Stremio VIP Movies Addon Engine to version 1.7.0.

## Phase 0: Codebase & Architecture Survey
- Dispatch 3 Explorers / Spec Miners:
  * Explorer 1 (HLS & Streaming Architecture): Analyze `src/routes/hls.js`, base64 encoding/decoding, URL resolution, Referer handling, binary streaming.
  * Explorer 2 (HTML Providers & Scrapers): Analyze `src/providers/stp.js`, `clbpx.js`, `yan.js`, Cheerio usage, catalog parsing, stream scraping, Donghua guards.
  * Explorer 3 (Matching Engine & Test Infrastructure): Analyze search/matching in `src/providers/kkphim.js`, `nguonc.js`, existing test suites (`tests/verify_all_providers_playback.js`, `tests/`), requirements for `tests/verify_v170_playback.js`.

## Phase 1: Planning & Decomposition (PROJECT.md)
- Synthesize survey findings into `PROJECT.md` (Feature Inventory, Architecture, Milestones, Interface Contracts, Code Layout).

## Phase 2: Implementation & Verification Tracks
- Milestone 1: Overhaul HLS Proxy (`src/routes/hls.js`)
- Milestone 2: Implement Real Cheerio Scrapers for STP, CLBPX, YAN with Guards
- Milestone 3: Multi-Keyword Fallback & Flexible Episode Matching for KDrama & US-UK
- Milestone 4: E2E Playback Verification Test Suite (`tests/verify_v170_playback.js`) & Full Regression Testing
- Milestone 5: Versioning v1.7.0, Brand Signature, Git Commit & Push

## Phase 3: Gate & Acceptance Verification
- Ensure 100% assertions pass across all test suites (`verify_v170_playback.js`, `verify_all_providers_playback.js`, `npm test`, `node --check src/index.js`).
- Complete forensic audit verification.
- Provide final handoff report.
