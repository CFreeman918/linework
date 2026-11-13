# Linework

A touch-first diagram editor for flowcharts, P&IDs and simple schematics. It's built for tablets first (Android in particular) and also works with a mouse.

It runs on [maxGraph](https://github.com/maxGraph/maxGraph), the TypeScript successor to mxGraph (the engine behind draw.io). The touch layer and UI around it are custom.

**Live app:** https://cfreeman918.github.io/linework/ — open it in Chrome on Android and choose *Add to Home screen* / *Install app* to run it fullscreen and offline.

## Features

- **Shapes**: basic shapes, flowchart shapes, and a starter symbol set (valve, pump, instrument bubble, resistor, capacitor, ground).
- **Connection points**: every shape has editable connection points. Select a shape, tap **Points**, then tap to add a point or tap one to remove it.
- **Reusable symbols**: save any shape or group, with its connection points, to the **Mine** library. Multi-select shapes and tap **Make symbol** to combine them.
- **Connectors**: elbow, straight, or curved routing, with arrowheads on either end. Connectors stay attached when shapes move.
- **Labels**: free-floating text plus labels on every shape and connector.
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

## Development

```bash
npm install
npm run dev      # dev server, reachable from a tablet on the same network
npm run build    # production build in dist/
npm run preview  # serve the production build
```

Pushing to `main` builds the app and deploys it to GitHub Pages (`.github/workflows/deploy.yml`).

## File format

`.linework` files are maxGraph model XML. Connection points live on each cell's style as `ports=x,y;x,y`, with coordinates relative to the shape (0–1).

## Known gaps

- Connection-point editing ignores rotation, so set points before rotating a shape.
- Exported images use system fonts instead of IBM Plex.
- Saved symbols live in the browser's local storage and aren't included in diagram files yet.

## License

MIT
