# CI Scraper Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve CI-only diagnostic artifacts when the category-page scrape fails and halt the pipeline at that failure.

**Architecture:** `scraper.js` will begin tracing only in CI, save the page state and trace to a run-local diagnostics directory after the initial category-page failure, and rethrow that failure. The workflow will upload that directory regardless of job status.

**Tech Stack:** Node.js, Playwright, Jest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-05-ci-scraper-diagnostics-design.md`

## Global Constraints

- Capture diagnostics only when `CI=true` and the initial category selector fails.
- Save screenshot, URL/title metadata, rendered HTML, and Playwright trace ZIP.
- Upload diagnostics with an `if: always()` workflow step.
- Do not alter successful or local scraper behavior.

## Review Focus

- A successful CI scrape must not create diagnostics.
- A local failure must not create diagnostics.
- A CI failure must retain the final URL and title even if screenshot or trace capture fails.
- The workflow must attempt artifact upload after the scraper exits nonzero.
- The pipeline must not run downstream scripts after the scraper fails.

---

### Task 1: Make scraper diagnostics testable and fail fast

**Files:**
- Modify: `scraper.js`
- Create: `tests/scraperDiagnostics.test.js`

**Interfaces:**
- Produces: a CI-only diagnostic directory containing `page.png`, `page.html`, `page.json`, and `trace.zip` on initial category-page failure.
- Produces: a nonzero scraper process exit for that failure.

- [ ] **Step 1: Write failing tests**

Test that a CI category-load failure saves all four expected files and propagates the failure; test that non-CI execution does not create diagnostics.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/scraperDiagnostics.test.js`

Expected: FAIL because the diagnostics behavior does not exist.

- [ ] **Step 3: Add CI-only diagnostics and failure propagation in `scraper.js`**

Use the existing page/context to capture metadata, HTML, screenshot, and trace after an initial category-load failure. Make individual diagnostic-capture failures non-fatal, then rethrow the original scrape error.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- tests/scraperDiagnostics.test.js`

Expected: PASS.

### Task 2: Upload CI diagnostics

**Files:**
- Modify: `.github/workflows/daily_scrape.yml`
- Test: `tests/scraperDiagnostics.test.js`

**Interfaces:**
- Consumes: diagnostics directory produced by `scraper.js`.
- Produces: a GitHub Actions artifact for available diagnostic files after every job outcome.

- [ ] **Step 1: Extend the failing test**

Assert that the workflow defines an always-running upload-artifact step targeting the diagnostic directory and ignoring a missing directory.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/scraperDiagnostics.test.js`

Expected: FAIL because no upload step exists.

- [ ] **Step 3: Add the workflow artifact step**

Use `actions/upload-artifact` with `if: always()`, `if-no-files-found: ignore`, and a CI diagnostics artifact name.

- [ ] **Step 4: Run the focused test and full unit suite**

Run: `npm test -- tests/scraperDiagnostics.test.js && npm test`

Expected: PASS.
