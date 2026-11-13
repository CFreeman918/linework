# Linework

A touch-first diagram editor for flowcharts, P&IDs and simple schematics. It's built for tablets first (Android in particular) and also works with a mouse.

It runs on [maxGraph](https://github.com/maxGraph/maxGraph), the TypeScript successor to mxGraph (the engine behind draw.io). The touch layer and UI around it are custom.

**Live app:** https://cfreeman918.github.io/linework/ — open it in Chrome on Android and choose *Add to Home screen* / *Install app* to run it fullscreen and offline.

## Features

- **Shapes**: basic shapes, flowchart shapes, and a starter symbol set (valve, pump, instrument bubble, resistor, capacitor, ground).
- **Connection points**: every shape has editable connection points. Select a shape, tap **Points**, then tap to add a point or tap one to remove it.
- **Reusable symbols**: save any shape or group, with its connection points, to the **Mine** library. Multi-select shapes and tap **Make symbol** to combine them.
- **Symbol editor**: in **Mine**, tap **New symbol**, or long-press (right-click) a symbol and choose **Edit symbol**. The editor has its own canvas: draw, add library shapes, and drag the round markers to place connection points. Long-press empty canvas to add a point. **Edit as symbol** on any shape in a diagram edits that shape in place, and its connectors stay attached.
- **Draw tool** (pen): lines (drag, or tap two points), polylines (tap points, tap the first point to close the shape, or **Finish**), and arcs (start, end, then a point the arc passes through). Drawings are ordinary shapes, so they can be resized, restyled and connected to.
- **SVG import**: ⋯ menu → **Import SVG as symbol**, or **Import SVG** in Mine. Paths and basic shapes become line art that follows the theme and the Style panel. Dark fills use the line color and light fills use the fill color. SVGs with text, embedded images, gradients or masks are placed as a fixed picture instead.
- **Connectors**: elbow, straight, or curved routing, with arrowheads on either end. Connectors stay attached when shapes move.
- **Labels**: free-floating text plus labels on every shape and connector.
- **Styling**: tap **Style** to set fill, line color, width and dash, text color, size, bold/italic and alignment. Changes apply to everything selected.
- **Editing**: copy, cut and paste, select all, nudge with arrow keys, align and distribute, and a snap-to-grid toggle.
- **Files**: autosaves on the device, opens and saves `.linework` files, and exports SVG and PNG.

## Touch controls

| Gesture | Action |
| --- | --- |
| One finger on empty canvas | Pan |
| Two fingers | Pinch zoom |
| Stylus on empty canvas | Box select |
| Long press | Context menu |
| Double tap | Edit label |
| Connect tool: drag between points, or tap one point then another | Draw a connector |
| Long press on empty canvas after copying | Paste here |
| Draw tool: drag, or tap points | Draw a line, polyline or arc |

With two or more shapes selected, **Arrange** aligns them or spreads them out evenly. Snap to grid can be turned off in the ⋯ menu.

## Keyboard

| Keys | Action |
| --- | --- |
| Ctrl+C / Ctrl+X / Ctrl+V | Copy / cut / paste |
| Ctrl+A | Select all |
| Ctrl+D | Duplicate |
| Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y | Undo / redo |
| Arrow keys | Nudge by one grid step (Shift: 1px) |
| Delete / Backspace | Delete selection |
| C | Toggle connect mode |
| P | Toggle the draw tool (Enter finishes a polyline, Esc cancels the current drawing) |
| Right-click | Context menu |
| Esc | Back to select mode, clear selection |

## Development

```bash
npm install
npm run dev      # dev server, reachable from a tablet on the same network
npm run build    # production build in dist/
npm run preview  # serve the production build
```

### In a container

With Podman or Docker installed, run this from the repo folder:

```bash
podman compose up    # or: docker compose up
```

Then open `http://<your-computer's-IP>:5173` on the tablet. Stop it with Ctrl+C.

Pushing to `main` builds the app and deploys it to GitHub Pages (`.github/workflows/deploy.yml`).

## File format

`.linework` files are maxGraph model XML. Connection points live on each cell's style as `ports=x,y;x,y`, with coordinates relative to the shape (0–1). Drawn and imported shapes use stencils named `lw-<hash>`, stored as escaped stencil XML in an `<lwStencils>` block before the closing tag. Linework removes the block before handing the XML to maxGraph.

## Known gaps

- Connection-point editing ignores rotation, so set points before rotating a shape.
- Exported images use system fonts instead of IBM Plex.
- The Mine library lives in the browser's local storage and isn't included in diagram files. Drawn and imported shapes used in a diagram are embedded in the file, so it opens correctly on another device.
- SVG import ignores per-element colors and stroke widths, and draws even-odd holes as filled.

## License

MIT
