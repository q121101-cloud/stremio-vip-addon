# BRIEFING — 2026-08-17T03:35:00Z

## Mission
Empirically stress-test provider search scoring, year matching accuracy, episode variation resolution, and stream protocol adherence across KKPhim, NguonC, and VsMov providers, delivering an empirical verdict (APPROVE / REJECT) in handoff.md.

## 🔒 My Identity
- Archetype: EMPIRICAL CHALLENGER
- Roles: critic, specialist
- Working directory: /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/teamwork_preview_challenger_m2_2
- Original parent: 681a8264-75a0-4d5c-84e1-8e78b180494b
- Milestone: Milestone 2
- Instance: 2 of 2

## 🔒 Key Constraints
- Review/Challenger-only: empirical testing through automated generators, oracles, harnesses. Do NOT modify production code directly.
- Must run verification code directly; do not rely on claims.
- Never write tests, source, or data in `.agents/` — write test scripts in `tests/` or run via Node.

## Current Parent
- Conversation ID: 681a8264-75a0-4d5c-84e1-8e78b180494b
- Updated: not yet

## Review Scope
- **Files to review**: `src/providers/kkphim.js`, `src/providers/nguonc.js`, `src/providers/vsmov.js`, `src/handlers.js`, `src/mapper.js`, `src/config.js`
- **Interface contracts**: `PROJECT.md`, `ORIGINAL_REQUEST.md`
- **Review criteria**: Search scoring precision, Year matching & penalization, Episode variations (`tap-1`, `1`, `Tap 01`, `Full`, etc.), Server name formatting (Vietsub, Thuyết Minh, Lồng Tiếng), Stream protocol compliance (`url` vs `externalUrl`).

## Attack Surface
- **Hypotheses tested**:
  1. Does year mismatch properly reduce match score or prevent wrong movie false positives? -> CONFIRMED PASS (tested scoring disambiguation on Dune, Spider-Man).
  2. Does episode variation matching handle various episode names/slugs accurately across providers? -> CONFIRMED PASS (tested `1`, `tap-1`, `Tap 01`, `Full`, index fallback, out of bounds).
  3. Does server naming format properly reflect Vietsub/Thuyết Minh/Lồng Tiếng without '#' artifacts? -> CONFIRMED PASS (tested stripping of `#`).
  4. Are generated stream objects 100% compliant with R3 Stremio Stream Protocol (exclusive `url` vs `externalUrl`, behaviorHints, valid proxy URLs)? -> CONFIRMED PASS.
  5. How do providers behave under network timeouts, malformed responses, or empty arrays? -> CONFIRMED PASS (5s timeout and `Promise.allSettled` isolation).
- **Vulnerabilities found**:
  1. [CRITICAL] `src/mapper.js` omits `extractYear` from `module.exports`. Calling `nguonc.getStreams` on any title search crashes with `TypeError: mapper.extractYear is not a function`, returning 0 streams.
  2. [MEDIUM] `src/mapper.js` omits `unpackDeanEdwards` from `module.exports`, imported by `src/providers/vsmov.js`.
  3. [HIGH] `DEFAULT_CONFIG.providers` in `src/config.js` is set to `['nguonc']` instead of all 3 providers `['nguonc', 'kkphim', 'vsmov']`, causing default `/stream/movie/tt1375666.json` queries to omit KKPhim and VsMov.
- **Untested angles**: None.

## Loaded Skills
- **Source**: N/A
- **Core methodology**: Empirical test generation, adversarial stress harnesses, schema and invariant validation.

## Key Decisions Made
- Verdict: **REJECT** due to the critical unexported `extractYear` runtime exception breaking NguonC title search matching and default provider activation mismatch.
- Documented exact root causes, reproduction commands, and required fixes for worker.

## Artifact Index
- `.agents/teamwork_preview_challenger_m2_2/handoff.md` — Final Challenger 2 verification report and verdict
- `tests/empirical_m2_challenger.test.js` — Empirical Challenger 2 test suite
- `tests/verification_simulation.test.js` — Proof-of-fix simulation script
