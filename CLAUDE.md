# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PatentDesk is an offline patent case management tool for patent examiners. It is a **single-file HTML/CSS/JS application** with no external dependencies that runs directly in the browser — no build step, no package manager, no server required.

## Architecture

The entire application lives in a single HTML file. All CSS and JavaScript are inline or embedded within that file. There is no bundler, framework, or runtime dependency.

Key constraints:
- **No dependencies** — everything must be self-contained
- **Offline-first** — must work without a network connection
- **Single file** — all code stays in one `.html` file; do not split into multiple files

## Running the App

Open the HTML file directly in a browser:
```
open index.html   # macOS
xdg-open index.html  # Linux
```

No build, install, or server step is needed.

## Testing

There is no automated test suite. Verify changes by opening the file in a browser and manually exercising the relevant functionality.
