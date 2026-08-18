# DISPATCH LOG

## 2026-08-18T10:09:12Z

**Context**: Task Dispatch from Orchestrator / User
**Content**:
Read /Users/quan/.gemini/antigravity/scratch/stremio-nguonc-addon/.agents/ORIGINAL_REQUEST.md carefully.
Investigate R3 (Multi-keyword fallback & flexible episode matching in KKPhim & NguonC) and R5 (Versioning v1.7.0, Brand Signature, and Git Deployment).

Specific investigation items:
1. `src/providers/kkphim.js` and `src/providers/nguonc.js` and `src/lib/utils.js`:
   - Check multi-keyword search fallback:
     * Attempt 1: Original English name (`meta.name` / `title`).
     * Attempt 2: Vietnamese name (from title or aliases).
     * Attempt 3: Stripped of season numbers (`Season 1`, `Phần 9`, `P1`) and special characters to search core keywords (e.g., `Teach You a Lesson`, `A Shop for Killers`, `Lanterns`, `9-1-1`).
   - Check flexible episode matching: matches `1`, `01`, `Tập 01`, `tap-1`, `Full`.
2. Versioning & Brand Signature:
   - Check `package.json`, `src/manifest.js`, `src/handlers.js` (footer `VIP Movies Addon v1.7.0 • Designed with Taste by <span class="brand-highlight">Q121101</span>`).
   - Check git status, git remotes, and repository readiness.
3. Check existing test suites: `npm test`, `node --check src/index.js`.
