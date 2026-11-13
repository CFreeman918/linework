# Linework

Touch-first, draw.io-style diagram editor for an Android tablet (also works with mouse). Flowcharts, P&IDs, simple schematics. Open source (MIT), deployed to GitHub Pages as an installable PWA.

## Stack

- **maxGraph 0.25** (`@maxgraph/core`): TypeScript successor to mxGraph, the engine behind draw.io. It owns the model, rendering, selection, move/resize handles, edge routing, undo, and XML serialization.
- **Vite 6 + vite-plugin-pwa**: `base: "./"` so the build works under `/linework/` on Pages.
- Plain JS with no framework. App code is in `src/main.js` and `src/style.css`, plus `src/svg-import.js` for the pure SVG → stencil conversion. Markup is in `index.html`.
- Fonts come from `@fontsource` (IBM Plex Sans/Mono) and are bundled, so the app works offline.

## Commands

- `npm run dev`: dev server on all interfaces (port 5173) so the tablet can reach it
- `npm run build` / `npm run preview`
- `podman compose up`: same dev server in a container (see `compose.yaml`)
- Pushing to `main` deploys to Pages via `.github/workflows/deploy.yml`.

## Architecture (src/main.js)

The app keeps maxGraph for the engine and replaces its interaction layer for touch:

- **Gesture layer**: capture-phase `pointerdown/move/up` listeners on `window` run before maxGraph's handlers. They implement two-finger pinch zoom, one-finger pan on empty canvas, long press for the context menu (`lpTimer`), and stylus box select on empty canvas. When they take a gesture they call `stopImmediatePropagation()` and `resetMg()` so maxGraph's handlers drop it. Taps on cells fall through to maxGraph's SelectionHandler, which does move and resize.
- **Modes**: `select`, `box` (rubber band), `connect`, `ports`. Set with `setMode()`. maxGraph's built-in ConnectionHandler is disabled (`setConnectable(false)`). Connecting is custom: the SVG `#overlay` draws port circles, `hitPort()` hit-tests with a 26px radius, and `connect()` inserts the edge with `exitX/exitY/entryX/entryY` styles. Drag from point to point, or tap one point then another (`armed`).
- **Connection points ("ports")**: `graph.getAllConnectionConstraints` is overridden by `constraintsFor()`. Priority: the cell style's `ports` string (`"x,y;x,y"`, relative 0–1, set in Points mode), then the stencil's `<connections>`, then the four side midpoints. Text-only cells (no fill, no stroke) have no ports.
- **Stencils**: custom symbols are XML stencils in `STENCILS`, registered with `StencilShapeRegistry`. Library tiles are defined in `LIB` (basic / flow / symbols). User-saved symbols ("Mine") live in localStorage under `linework.symbols.v1`. A multi-part symbol is a transparent group cell with `ports` and child vertices.
- **Custom stencils**: drawn shapes and imported SVGs register content-addressed stencils `lw-<hash>` (`addStencil()`), kept in localStorage under `linework.stencils.v1` and pruned at boot when neither the doc nor Mine uses them. `exportXml()` appends an `<lwStencils>` block with the ones the model uses; `takeStencils()` strips and registers it before any import. A `StencilShape.drawNode` patch adds `<fillcolor color="stroke"/>` ("ink" fill).
- **SVG import** (`src/svg-import.js`, no graph dependency): sanitises the SVG, mounts it in a sandboxed iframe (no scripts) to resolve CSS and `getScreenCTM()`, flattens geometry to move/line/quad/curve (arcs → cubics), and builds stencil XML with `stencilFromPaths()`. Text, images, `<use>`, masks, gradients or more than 6000 segments fall back to an `image` shape with a percent-encoded data URI. The draw tool reuses `stencilFromPaths()` and `arcToCubics()`.
- **Draw mode** (`draw`): the gesture layer's `draw` gesture feeds `drawStep()`. `draft` holds points in progress, and `commitDrawing()` inserts a stencil vertex. Open paths get `ports` at their endpoints.
- **Symbol editor**: `openEditor(item, target)` flushes autosave, stashes the model root and a *copy* of the undo history, then `model.setRoot(model.createRoot())`. `closeEditor()` restores the same root objects, so the history stays valid. Autosave is paused while `editing` is set. Connection points are `lwPort` marker vertices (excluded from ports and connect mode). `editorItem()` flattens the canvas into a Mine item. The target is `new`, `mine` (index), or `cell` (`applyItemToCell()`, shifted so content stays in place). Thumbnails come from `itemThumb()`, which renders in an offscreen Graph with fixed light colours; CSS `--thumb-filter` inverts them in dark mode.
- **Context bar and style panel**: `updateBar()` rebuilds the bottom bar on every selection or model change. The **Style** chip toggles `#pop` (`renderPop()`), which restyles every selected cell inside one `batchUpdate` (`restyle()`) so a change is one undo step.
- **Clipboard / arrange**: maxGraph's static `Clipboard`; `pasteAt()` re-centres off-screen pastes. Align uses `graph.alignCells`; distribute is custom (equal gaps). Snap state is in localStorage under `linework.snap.v1`.
- **Persistence**: autosave of model XML to localStorage under `linework.doc.v1`. Files (`.linework`) are the same XML. SVG/PNG export clones the draw pane of maxGraph's SVG (`buildSvg()`).
- **Theme**: CSS tokens on `:root` with dark mode overrides. `applyTheme()` copies them into maxGraph's default vertex/edge styles and handle colors.
- Debug handle: `window.__lw` exposes graph, model, view and helpers for tests.

## maxGraph quirks found so far

- On touch, two taps within `graph.doubleTapTimeout` count as a double tap, and the second gesture won't drag. The timeout is set to 280ms and `tapAndHoldEnabled` is off because the app handles long press itself.
- `HandleConfig`, `VertexHandlerConfig` and `EdgeHandlerConfig` are global config objects. Handle sizes are enlarged for touch.
- `ConstraintHandler.pointImage` is patched per instance to a themed port marker.
- The model fires UNDO *after* CHANGE, so undo/redo buttons sync in the UNDO listener too.
- `view.scaleAndTranslate()` is the single call used for pan and zoom, batched through `requestAnimationFrame` in `setView()`.

## Known gaps / next ideas

- Port editing ignores rotation.
- Exported images fall back to system fonts.
- The Mine library isn't stored in diagram files (custom stencils are).
- Draw tool snaps to the grid only, not to existing endpoints.
- No snap-to-port when dragging existing edge ends beyond maxGraph's default.
- No real-device testing yet. Touch was tested with Playwright/CDP touch events on desktop Chrome.

## Testing

No automated test suite yet. Interaction checks were done with Playwright: `has_touch=True` plus CDP `Input.dispatchTouchEvent` for multi-touch, driving the app through `window.__lw`. Check both themes and a 390px-wide phone layout.
