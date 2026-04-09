---
name: sosearch-local-search
description: Use SoSearch as a self-hosted web search backend without API keys. Use when the user wants to install, run, query, or share a local SoSearch instance; expose a local HTTP search API; or replace paid search APIs with a self-hosted DuckDuckGo/Yahoo/Brave meta-search service.
---

# SoSearch Local Search

Use this skill when the goal is to run or use **SoSearch** locally as a no-key search backend.

## What this skill provides

- install SoSearch from source
- start or stop a local SoSearch server
- query the local API from the terminal
- package/share a reusable workflow with friends

## Bundled scripts

- `scripts/install_sosearch.sh` — clone and build SoSearch
- `scripts/run_sosearch.sh` — start the API server in background
- `scripts/stop_sosearch.sh` — stop the local server
- `scripts/query_sosearch.py` — query the local API and print JSON

## Bundled binary

- `assets/linux-x64/SoSearch` — prebuilt Linux x86_64 binary

If the target machine is Linux x86_64 with glibc, prefer the bundled binary and skip compilation.

## Typical workflow

1. Build it once:

```bash
bash scripts/install_sosearch.sh
```

2. Start the server:

```bash
bash scripts/run_sosearch.sh
```

3. Query it:

```bash
python3 scripts/query_sosearch.py "rust async programming" --num 5
```

4. Stop it when done:

```bash
bash scripts/stop_sosearch.sh
```

## Defaults

- repo: `https://github.com/NetLops/SoSearch.git`
- install dir: `~/.openclaw/workspace/_repos/SoSearch`
- port: `18080`

## Build requirements

For source builds on Linux, expect these to be needed:

- Rust / Cargo
- `cmake`
- `build-essential`
- `libc6-dev`
- `clang`

If a prebuilt binary exists for the target machine, runtime needs are minimal (standard glibc libraries).

## Notes

- SoSearch still needs outbound internet access to scrape search engines.
- It avoids API keys, but not rate limits or anti-bot risk.
- Best for personal use, local tooling, prototypes, and low-volume search.
