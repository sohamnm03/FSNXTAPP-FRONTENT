# AI Agents package

This package runs locally from the Electron frontend. Runs are noninteractive,
headless by default, destructive actions are forced off, and every
report/checkpoint/screenshot is written below the application's local user-data
runtime directory.

Install package dependencies once during deployment (never from the Install API):

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
