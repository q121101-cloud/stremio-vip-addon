# Plan — VIP Movies Addon Engine v1.5.0 Orchestration (Gen 2)

## Current Status
Last visited: 2026-08-18T08:10:00+07:00
Current iteration: 1 / 32

## Milestones & Work Items
- [x] **Milestone 1 (R1)**: Provider Standardization & Conflict Resolution (`src/lib/utils.js`, `src/providers/*.js`) — Completed & verified by worker_m1.
- [ ] **Milestone 2 (R2)**: Fail-Safe Stream Aggregator & Cinemeta Resolution (`src/handlers.js`) — 4000ms timeout per provider with Promise.allSettled, Cinemeta metadata lookup, safe stream filtering, always HTTP 200 `{ streams: [...] }`.
- [ ] **Milestone 3 (R3)**: 404 Routing Elimination & 22 Catalogs K20 Standard (`src/index.js`, `src/manifest.js`, `src/config.js`) — Explicit `/` and `/:config` routing, safe extra parsing, all 22 K20 catalogs properly configured.
- [ ] **Milestone 4 (R4)**: Mandatory Real Video Segment Playback Test (`tests/verify_playback.js`) — Ephemeral server, multi-provider streams (VSMOV 4K, KKPhim, NguonC), manifest proxy rewriting, real binary segment download >50KB with HTTP 200 & sync byte 0x47.
- [ ] **Milestone 5 (R5)**: UI Preservation, Versioning & Deployment — Cyber-Glassmorphism UI preservation with signature `VIP Movies Addon v1.5.0 • Powered by <span class="brand-highlight">Q121101</span>`, package.json / manifest.js version 1.5.0, git add/commit/push.

## Orchestration Steps
1. **Survey / Exploration**: Dispatch Explorer subagents to verify the current state of R2, R3, R4, and R5 across the codebase, identifying any gaps against the acceptance criteria.
2. **Implementation / Alignment**: If any gaps exist in R2-R5, dispatch Worker subagent(s) to apply fixes and run syntax/test checks.
3. **Verification & Hardening**:
   - Dispatch Reviewers to inspect code correctness, routing, catalogs, and UI.
   - Dispatch Challengers to run adversarial & playback verification test suites (`tests/verify_playback.js`, `tests/e2e.test.js`, etc.).
   - Dispatch Forensic Auditor to verify integrity (no hardcoded cheats, real proxy streaming).
4. **Deployment & Final Gate**:
   - Verify `git add`, `commit`, and `git push origin main`.
   - Synthesize results and report completion to parent.
