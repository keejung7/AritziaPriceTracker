# CI Scraper Diagnostics Design

## Intent

When the initial Aritzia category page cannot be scraped in GitHub Actions, preserve enough evidence to identify the response variant without changing successful runs or local scraping behavior.

## Goals

- In CI only, on the initial category-load failure, save a full-page screenshot, final URL and title, rendered HTML, and a Playwright trace archive.
- Upload those files from the workflow even after the pipeline exits unsuccessfully.
- Stop the pipeline at the scraper failure instead of allowing missing-artifact errors to follow.

## Non-goals

- No bot-protection bypass or scraping-strategy change.
- No diagnostics on successful runs or local runs.
- No diagnostic artifacts committed to the repository.

## Approaches

- **Selected:** collect all diagnostics in `scraper.js` and upload the directory with `actions/upload-artifact`. The page and browser context are available at the failure site, and artifact retention remains CI-managed.
- **Rejected:** capture only screenshot and HTML. It does not preserve the navigation and network timeline available in a trace.

## Constraints

- Diagnostics run only when `CI=true` and the initial category selector cannot be obtained.
- Artifact upload must use `if: always()` so it still runs after a failed pipeline.
- Existing successful scraping behavior must remain unchanged.
