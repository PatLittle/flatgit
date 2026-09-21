# FlatGit

A static, client-side GitHub data and Markdown viewer inspired by FlatGitHub / Flat Viewer.

## Features

- Public GitHub repository browser
- CSV and TSV interactive tables
- JSON and JSONL/NDJSON table or source views
- Markdown rendered/source/split views
- Repository-aware relative Markdown links and images
- Text and SVG previews
- Branch selector
- Search, sorting, pagination, column visibility, basic profiling
- Export filtered table rows to CSV
- Light/dark mode
- No backend, authentication, database, npm, or build step

## Usage

Paste a public GitHub repository, file, or Gist URL into FlatGit. Use **Full view** for repository, branch, folder, and file navigation; use **Minimal view** for a clean, shareable preview of the linked file. FlatGit runs entirely in the browser.

### Repository and file tools

- Browse public repositories, branches, folders, files, and multi-file Gists.
- Expand folders lazily and automatically reveal the current file in the tree.
- View file size, detected type, branch, and last-modified date.
- Copy the FlatGit viewer link or open the raw file and its GitHub page.
- Toggle full/minimal layouts with the button or `Shift+M`.

### Interactive tables

CSV, TSV, JSON records, SQLite query results, and Parquet rows use the interactive table viewer. You can:

- search across every column;
- filter individual columns;
- sort columns;
- resize and drag columns into a new order;
- hide or show columns;
- choose 25, 50, 100, or 250 rows per page;
- use First, Previous, Next, and Last controls or enter a page number directly; and
- export the filtered, visible columns as CSV.

### Supported previews

| Content | Supported extensions | Behaviour |
| --- | --- | --- |
| Delimited data | `.csv`, `.tsv` | Interactive table with search, filters, sorting, pagination, column controls, and CSV export. |
| JSON data | `.json`, `.jsonl`, `.ndjson` | Record arrays can be flattened into a table; JSON tree/source uses syntax highlighting and folding. |
| GeoJSON | `.geojson` | Table, collapsible JSON tree, and interactive Leaflet map modes with feature-property popups. |
| Markdown | `.md`, `.markdown`, `.mdown`, `.mkd` | Rendered, Source, and Split modes with GitHub styling, sanitized HTML, repository-relative links/images, badges, and Mermaid fences. |
| Mermaid | `.mmd`, `.mermaid` | Rendered Mermaid diagram. |
| Parquet | `.parquet`, `.pq` | Interactive table; up to the first 5,000 rows are loaded in the browser. |
| SQLite | `.sqlite`, `.sqlite3`, `.db`, `.db3`, `.sdb` | Select a table/view and run read-only SQL in the in-browser database. |
| PDF | `.pdf` | Native browser PDF preview. |
| Raster images | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`, `.bmp`, `.ico` | Responsive image preview. |
| SVG | `.svg` | Sanitized rendered graphic plus source. |
| Microsoft Word | `.doc`, `.docx`, `.docm`, `.dot`, `.dotx`, `.dotm`, `.rtf` | Microsoft Office web preview from the public raw-file URL. |
| Microsoft Excel | `.xls`, `.xlsx`, `.xlsm`, `.xlsb`, `.xlm`, `.xlt`, `.xltx`, `.xltm` | Microsoft Office web preview. |
| Microsoft PowerPoint | `.ppt`, `.pptx`, `.pptm`, `.pps`, `.ppsx`, `.ppsm`, `.pot`, `.potx`, `.potm` | Microsoft Office web preview. |
| Other Microsoft formats | `.one`, `.onepkg`, `.vsd`, `.vsdx`, `.vsdm`, `.vdx`, `.vss`, `.vssx`, `.vst`, `.vstx`, `.pub`, `.pubx`, `.mpp`, `.mpt`, `.mpd`, `.accdb`, `.accde`, `.accdr`, `.accdt`, `.mdb`, `.mde`, `.msg`, `.eml` | Microsoft Office web preview when the service supports the file. |
| Code and text | Any other text-based extension | Read-only Ace editor with automatic syntax detection, highlighting, line numbers, search, and collapse/expand controls. Unknown formats fall back to plain text. |

Office previews are rendered by Microsoft from a publicly accessible raw GitHub URL. Browser or Microsoft service support can vary by format.

### Querying SQLite files

Open a recognized SQLite file, select a table or view, edit the generated query, and choose **Run query**. FlatGit accepts only read-only statements beginning with `SELECT`, `WITH`, `PRAGMA`, or `EXPLAIN`. Press `Ctrl+Enter` or `Cmd+Enter` to run the query from the editor.

Use double quotes around table or column names that contain spaces.

```sql
-- Preview 25 rows
SELECT * FROM "table_name" LIMIT 25;

-- Show the next 25 rows
SELECT * FROM "table_name" LIMIT 25 OFFSET 25;

-- Count every row
SELECT COUNT(*) AS total_rows FROM "table_name";

-- Count records by category and show the 20 largest groups
SELECT "category", COUNT(*) AS records
FROM "table_name"
GROUP BY "category"
ORDER BY records DESC
LIMIT 20;

-- Filter nulls, sort, and limit the output
SELECT *
FROM "table_name"
WHERE "date" IS NOT NULL
ORDER BY "date" DESC
LIMIT 100;
```

The database is loaded into memory in the browser. Queries cannot modify the GitHub file.

### Markdown views

- **Rendered** displays sanitized GitHub-Flavoured Markdown with tables, links, images, badges, and Mermaid diagrams. Relative document links stay inside FlatGit; relative images resolve against raw GitHub content.
- **Source** displays the original Markdown text.
- **Split** displays source and rendered output side by side.

### File history and comparison

Choose **History** for a repository file. FlatGit requests up to 100 commits that touched the current path. Select an older and newer commit to see GitHub's line patch with commit dates, short SHAs, messages, and addition/deletion totals. GitHub may omit a patch for binary, renamed, unchanged, or very large files. History is not available for Gists.

### Light and dark mode

Use the ◐ button or press `T` to switch themes. FlatGit stores the selection in browser local storage; if no preference has been saved, it follows the operating-system colour preference.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Shift+M` | Toggle full and minimal view. |
| `B` | Collapse or expand the repository sidebar in full view. |
| `/` | Focus the GitHub URL field in full view. |
| `H` | Open history for the current repository file. |
| `G` | Open the repository or Gist on GitHub. |
| `T` | Toggle light/dark theme. |
| `?` | Open keyboard shortcut help. |
| `Esc` | Close shortcut help; on narrow full-view screens, close the sidebar. |

Shortcuts are ignored while typing in a form field or code viewer.

## Run locally

The app must be served over HTTP because browsers restrict some `fetch()` behavior from `file://` pages.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy to GitHub Pages

The included GitHub Actions workflow publishes the repository root to GitHub Pages whenever `main` changes. `404.html` mirrors `index.html`, allowing direct `/full/...` and minimal-view URLs to fall back into the client-side router.

The most reliable Pages URL form is hash-based:

```text
https://patlittle.github.io/flatgit/#/owner/repo/blob/main/data/file.csv
```

Path routes are also supported on the project site:

```text
https://patlittle.github.io/flatgit/full/owner/repo/blob/main/data/file.csv
https://patlittle.github.io/flatgit/owner/repo/blob/main/data/file.csv
```

## External browser libraries

Loaded from jsDelivr:

- Papa Parse — CSV/TSV
- marked — Markdown
- DOMPurify — sanitization
- Mermaid — diagrams
- sql.js — in-browser SQLite
- Ace — syntax highlighting and code folding
- Hyparquet and Hyparquet Compressors — Parquet metadata and rows
- github-markdown-css — rendered Markdown styling

Microsoft Office formats use Microsoft's public Office web viewer.

The application code itself is plain JavaScript with no framework.

## Current features

- GitHub repository and file URL routing
- Collapsible repository navigation
- CSV/TSV tables with global search, per-column filters, sorting, draggable column ordering and resizable columns
- Column type/distinct/empty profiling directly in aligned table headers
- JSON/JSONL/NDJSON flattening and table views
- GitHub-Flavored Markdown rendering with GitHub styling, badges/images, repository-relative links and Mermaid diagrams
- Markdown Rendered / Source / Split modes
- File history for the current path using GitHub commits
- Commit-to-commit file comparisons with line numbers and addition/deletion totals
- Raw and GitHub links, branch selection, filtered CSV export, dark/light theme

### Markdown

Markdown is parsed with Marked in GFM mode, sanitized with DOMPurify, styled with `github-markdown-css`, and Mermaid fenced blocks are rendered client-side. Relative document links remain inside FlatGit; relative images resolve against raw GitHub content.

### History and comparisons

Use **History** in the file toolbar. FlatGit requests the commits that touched the current path, lets you preview historical versions, and compares a selected commit with the previous file-changing commit. CSV/TSV comparisons also summarize added, changed, and removed rows using the first column as the default row identifier.
