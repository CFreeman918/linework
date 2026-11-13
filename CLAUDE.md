# Linework

Touch-first, draw.io-style diagram editor for an Android tablet (also works with mouse). Flowcharts, P&IDs, simple schematics. Open source (MIT), deployed to GitHub Pages as an installable PWA.

## Stack

- **maxGraph 0.25** (`@maxgraph/core`): TypeScript successor to mxGraph, the engine behind draw.io. It owns the model, rendering, selection, move/resize handles, edge routing, undo, and XML serialization.
- **Vite 6 + vite-plugin-pwa**: `base: "./"` so the build works under `/linework/` on Pages.
- Plain JS with no framework. All app code is in `src/main.js` and `src/style.css`. Markup is in `index.html`.
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
- **Context bar and style panel**: `updateBar()` rebuilds the bottom bar on every selection or model change. The **Style** chip toggles `#pop` (`renderPop()`), which restyles every selected cell inside one `batchUpdate` (`restyle()`) so a change is one undo step.
- **Clipboard / arrange**: maxGraph's static `Clipboard`; `pasteAt()` re-centres off-screen pastes. Align uses `graph.alignCells`; distribute is custom (equal gaps). Snap state is in localStorage under `linework.snap.v1`.
- **Persistence**: autosave of model XML to localStorage under `linework.doc.v1`. Files (`.linework`) are the same XML. SVG/PNG export clones the draw pane of maxGraph's SVG (`buildSvg()`).
- **Theme**: CSS tokens on `:root` with dark mode overrides. `applyTheme()` copies them into maxGraph's default vertex/edge styles and handle colors.
- Debug handle: `window.__lw` exposes graph, model, view and helpers for tests.

## maxGraph quirks found so far

- On touch, two taps within `graph.doubleTapTimeout` count as a double tap, and the second gesture won't drag. The timeout is set to 280ms and `tapAndHoldEnabled` is off because the app handles long press itself.
- `HandleConfig`, `VertexHandlerConfig` and `EdgeHandlerConfig` are global config objects. Handle sizes are enlarged for touch.
- `ConstraintHandler.pointImage` is patched per instance to a themed port marker.
- `view.scaleAndTranslate()` is the single call used for pan and zoom, batched through `requestAnimationFrame` in `setView()`.

## Known gaps / next ideas

- Port editing ignores rotation.
- Exported images fall back to system fonts.
- Saved symbols aren't stored in diagram files.
- No snap-to-port when dragging existing edge ends beyond maxGraph's default.
- No real-device testing yet. Touch was tested with Playwright/CDP touch events on desktop Chrome.

## Testing

No automated test suite yet. Interaction checks were done with Playwright: `has_touch=True` plus CDP `Input.dispatchTouchEvent` for multi-touch, driving the app through `window.__lw`. Check both themes and a 390px-wide phone layout.
