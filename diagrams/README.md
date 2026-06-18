# Shamagama Architecture Diagrams

5 system-design / architecture diagrams for the Yaksha FAQ Portal (v1.70).
Generated via the Excalidraw MCP server.

## Files

| # | Diagram | Elements | Files |
|---|---------|----------|-------|
| 1 | System Architecture  | 79 | `01-system-architecture.json` + `.excalidraw.json` |
| 2 | Use-Case Diagram     | 84 | `02-use-case.json` + `.excalidraw.json` |
| 3 | Dataflow (DFD L1)    | 69 | `03-dataflow.json` + `.excalidraw.json` |
| 4 | Ask-a-Question Flow  | 53 | `04-ask-flowchart.json` + `.excalidraw.json` |
| 5 | Database ER Diagram  | 73 | `05-er-diagram.json` + `.excalidraw.json` |

Each diagram is saved in two formats:
- `*.json` - raw Excalidraw element array (for inspection / scripting)
- `*.excalidraw.json` - wrapped in the full Excalidraw file envelope (drag into excalidraw.com)

## How to view

### Option A - excalidraw.com (browser, no install)
1. Go to https://excalidraw.com
2. Click the hamburger menu (top-left) -> "Open" -> drag any `*.excalidraw.json` file into the page
3. The diagram renders, you can edit, export PNG/SVG, or share via the shareable link

### Option B - Excalidraw desktop app
1. Install: `brew install --cask excalidraw` (or download from https://excalidraw.com)
2. File -> Open -> pick the `.excalidraw.json` file

### Option C - shareable URL
Ask me to upload any of them to excalidraw.com via the MCP export tool and I'll get you a
shareable link like `https://excalidraw.com/#json=...`. (Smoke-tested working, just needs
to be done one diagram at a time.)

## Checkpoints (MCP server state)

These are the server-side checkpoint IDs from the original Excalidraw MCP create_view calls.
Not directly useful to you (the MCP UI widget isn't rendered in CLI mode) but kept here for reference:

| Diagram | Checkpoint ID |
|---------|---------------|
| 1 System Architecture | `49536e6888a1491f96` |
| 2 Use-Case | `da1b0ba1d24047eba0` |
| 3 Dataflow | `1552c1a6d2ee403ba8` |
| 4 Flowchart | `da574a0abb294f1ea8` |
| 5 ER Diagram | `0888da69a6cb46e891` |
