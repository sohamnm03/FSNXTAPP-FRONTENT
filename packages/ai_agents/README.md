# AI Agents package

This package runs locally from the Electron frontend. Runs are noninteractive,
headless by default, destructive actions are forced off, and every
report/checkpoint/screenshot is written below the application's local user-data
runtime directory.

For local development, install the package dependencies and Chromium once:

```powershell
python -m pip install -r packages/ai_agents/requirements.txt
python -m playwright install chromium
```

From the frontend root, add `packages/ai_agents/src` to `PYTHONPATH` and run:

```powershell
python -m ai_agents.main --input-json inputs.json --output-dir runtime/cli
```

Add `--load-dotenv` only for intentional local CLI use. Backend workers do not
load `.env` files.

## Execution

Electron starts `worker.py` as a controlled, timeout-supervised Python subprocess
with JSON input on stdin and no shell. React communicates with it through the
context-isolated preload bridge; no Web Testing API request is sent to Flask.

## Windows distribution

Build the complete Windows installer from the repository root:

```powershell
npm run package:win
```

The packaging command creates a standalone PyInstaller worker containing Python,
the Python dependencies, and Playwright's Chromium browser, then includes it in
the Electron installer. End users do not need to install Python, pip packages, or
Playwright browsers. The resulting installer is written below `release/`.
