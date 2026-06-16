# Wardrobe Mini Program Refactor Plan

## Goal
Make the mini program easier to maintain and faster to iterate without changing the user-facing flows. Keep page routes, WXML event names, cloud function name, and existing `event.type` contracts stable.

## Completed
- Backed up the project to `C:\Users\GaoRuoHeng\Desktop\ai\衣柜\miniprogram-1-backup-20260616-235022`.
- Split `pages/index/index.js` into focused modules for data loading, grouping, drag, cache, selection, item panel, and plan/task metadata.
- Split `pages/home/home.js` into focused modules for wardrobe API, wardrobe view/cache, home actions, and admin actions.
- Split `cloudfunctions/quickstartFunctions/index.js` into a small dispatcher plus handlers/shared modules.
- Split large WXSS files into imported style modules:
  - `pages/home/styles/*.wxss`
  - `pages/index/styles/*.wxss`
- Updated `project.config.json` packaging ignores for local design/example resources.
- Secured admin mode by moving password validation to cloud function environment variables and using signed admin tokens for follow-up admin reads.
- Replaced normal item browsing pagination from `skip` reads to cursor reads.
- Added database index and admin environment variable notes in `DATABASE_OPTIMIZATION.md`.

## Current State
- `pages/index/index.js`: page shell, 537 lines.
- `pages/home/home.js`: page shell, 210 lines.
- `pages/home/home.wxss`: import shell, 4 lines.
- `pages/index/index.wxss`: import shell, 3 lines.

## Constraints
- Do not change database collection names.
- Do not change cloud function name `quickstartFunctions`.
- Do not change WXML event handler names.
- Do not delete unrelated untracked files: `PRODUCT.md`, `temp_ornaments.wxss`, `temp_wardrobe_card.wxml`.

## Verification
- `node --check` passed for 39 JS files across pages, utils, services, and cloud functions.
- `git diff --check` passed. Git only reported expected CRLF warnings.
- WXSS import targets resolved: 7 imports found and all target files exist.
- Admin auth and item pagination tests were added under `tests/`.
