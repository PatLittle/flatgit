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
- Historical-version previews and comparisons, including row-change summaries for CSV/TSV
- Raw and GitHub links, branch selection, filtered CSV export, dark/light theme

### Markdown

Markdown is parsed with Marked in GFM mode, sanitized with DOMPurify, styled with `github-markdown-css`, and Mermaid fenced blocks are rendered client-side. Relative document links remain inside FlatGit; relative images resolve against raw GitHub content.

### History and comparisons

Use **History** in the file toolbar. FlatGit requests the commits that touched the current path, lets you preview historical versions, and compares a selected commit with the previous file-changing commit. CSV/TSV comparisons also summarize added, changed, and removed rows using the first column as the default row identifier.
