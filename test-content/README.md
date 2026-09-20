# FlatGit test content

This directory contains reproducible example files for exercising FlatGit's viewers.

Run the generator from the repository root:

```bash
python test-content/generate_test_content.py
```

The generator writes all demonstration artifacts to `test-content/generated/`. It converts the root `README.md` to Word and PDF, captures the live FlatGit landing page in light and dark themes, builds a presentation from the landing-page content, and produces representative structured-data, database, diagram, code, text, image, and Office files.

The **Generate FlatGit test content** GitHub Action performs the same process on `workflow_dispatch` and commits changed generated files to the selected branch.

## Requirements

- Python 3.12
- Node.js 22
- Pandoc
- Chromium installed through Playwright
- Python packages in `requirements.txt`
- Node packages in `package.json`

The GitHub Action installs these dependencies automatically.

Set `FLATGIT_PAGE_URL` to capture another deployed instance or a local preview. When it is not set, the generator captures `https://patlittle.github.io/flatgit/`.
