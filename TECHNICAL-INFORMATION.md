# Technical Information

## Data pipeline

`src/main.py` fetches Technical Information alongside Sample Requests, Stock Requests, and Sales Orders. It uses the existing HTTP timeout (90 seconds), retry policy (three attempts, five seconds apart), Jakarta end date, and atomic JSON writer.

- Endpoint: `http://apps.islandsunindonesia.com:81/islandsun/master/Tir/json`
- Query: `dari=0001-01-01`, `sampai=<today in Jakarta>`, and blank `fil_status`, `tipe`, and `fil_lock`.
- Snapshot: `data/technical_information.json`. The response is preserved, including identifiers, original dates, and encoded document lists.
- Validation: each entry must contain `id_tir` and `tir_no`; `recordsFiltered` must equal the number of returned entries. An unavailable, malformed, or truncated response leaves the previous file intact and returns a failure exit status.
- `.github/workflows/fetch-json.yml` includes the new snapshot in its existing update step. Its Monday–Saturday, 08:00 Jakarta schedule and manual trigger are unchanged. The workflow has not been run remotely as part of this work.

Run `python src/main.py` from this repository to refresh all four datasets and the existing production summary. Install the existing `requirements.txt` first.

## Viewer

Open `technical-information.html`, also linked from `index.html`, `isi`, and `isi-share`. It uses version 1.3.3 of the locally copied family assets.

- Requested documents appear as bullet lists in both table cells and record details. Empty list items are omitted.
- The Requested documents filter offers individual document names and accepts multiple selections. A row matches any selected document; other filters, dates, and search apply together.
- Customer, PIC, status, type, lock status, destination, and availability have independent multi-select filters. Source status labels retain their original meanings and wording.
- Dates normalize to ISO for correct chronological sorting and range filtering. Raw dates remain available in the snapshot and record details.
- Search, column visibility, sorting, pagination, and selected filters are stored in the URL. A worker filters and sorts the loaded snapshot; only the current page is rendered.
- HTML-bearing fields become text. Portal edit/delete controls are excluded from record details; the viewer cannot submit or modify records.
- A failed refresh retains the displayed snapshot and offers retry.

## Verification record

On 20 September 2026, the live endpoint returned 5,867 records, matching the reported count. The saved snapshot contains those records.

Commands from this repository:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
node tests/check-technical-information.mjs
$env:ISI_PREVIEW_URL='http://127.0.0.1:4173'
node ..\isi\family-tools\check-operations.mjs
node ..\isi\family-tools\check-operation-boundaries.mjs
node ..\isi\family-tools\sync.mjs --check
```

The local virtual environment is ignored; an environment with the existing requirements installed works equally well. Browser tests use the bundled Playwright runtime, or `PLAYWRIGHT_PATH` when supplied. Start the preview with `node ..\isi\family-tools\serve.mjs` if port 4173 is not already serving the family.

Verified in installed Chrome and Edge: full-snapshot loading, document bullet lists, multiple document selections combined with PIC, URL restoration, chronological sorting, pagination, record details, malicious HTML fixtures, and failed-refresh preservation. Responsive checks cover widths 360, 430, 768, 1600, and 2560; screenshots cover light/dark schemes at 360 and 1600 pixels.

Product List checks confirm vertically centered name containers and the back-to-top button's fade, vertical translation, smooth scrolling, fade reversal, hidden/inert state, and reduced-motion behavior. Existing operational regression checks cover the other data viewers and app calculations/interactions. All pre-existing fetcher helper functions also match the committed source at the Python AST level.

Screenshots are kept locally under `../isi/family-tools/evidence/technical-information/`. Shared assets are canonical in `../isi/family/`; synchronize with `node ../isi/family-tools/sync.mjs` and check with `--check`.

No commits, pushes, deployments, real feedback submissions, or later redesign checkpoints were performed. Physical mobile devices and the remote scheduled workflow were not exercised.

## Viewport-bound data viewers

All six data viewers (including Exchange Rate) keep the page within the viewport. The table has its own vertical and horizontal scrolling area with a sticky header; pagination stays below it. Filters, search, refresh, and column visibility are available in the expandable **Filters and columns** panel, which scrolls independently when space is limited. Product List keeps its existing page scrolling and back-to-top control.

`node tests/check-table-workspaces.mjs` verifies all six viewers in Chrome and Edge at 360×640, 430×740, 768×600, 1600×900, 2560×1600, 800×320, and 320×320. Checks include 100-row pages, expanded filters and column options, table scrolling, visible pagination, URL restoration, record details, search/reset, and both launcher links. Exchange Rate uses controlled rate fixtures in this check. Screenshots are in `../isi/family-tools/evidence/table-workspaces/`. The Technical Information regression suite also passes with the expandable controls.
