# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (live reload against local Mendix app)
npm run dev

# Development with server mode
npm run start

# Production build (outputs .mpk to project)
npm run build

# Release build (runs lint first, then packages)
npm run release

# Lint
npm run lint
npm run lint:fix
```

The build output is a `.mpk` file (Mendix widget package) deployed to the Mendix project at `../../` (two levels up from this folder).

The Mendix app is expected at `http://localhost:8080` and the dev server runs on port 3000 (configured in `package.json` under `config`).

## Architecture

This is a **Mendix Pluggable Widget** that wraps [react-joyride](https://docs.react-joyride.com/) to provide guided onboarding tours inside Mendix applications.

### Key files

| File | Purpose |
|------|---------|
| `src/OnboardingWidget.xml` | Widget property schema — defines all configurable properties visible in Mendix Studio Pro |
| `src/OnboardingWidget.jsx` | Main widget entry point; handles all Mendix prop wiring, tour state machine, and joyride step construction |
| `src/components/OnboardingWidgetComponent.jsx` | Thin wrapper around `<Joyride>` that injects the custom tooltip |
| `src/components/CustomTooltip.jsx` | Fully custom tooltip UI (header, body, footer with nav dots/fraction, back/next/finish buttons, SVG icons) |
| `src/components/ErrorBoundary.jsx` | Class component; catches render errors inside the tour, logs them, and returns null to prevent page crashes |
| `src/ui/OnboardingWidget.scss` | SCSS styles using CSS custom properties (`--ow-primary`, `--ow-bg`, `--ow-text`, `--ow-radius`) |
| `src/OnboardingWidget.editorConfig.js` | Studio Pro editor hooks — only `getProperties` is active; `check`, `getPreview`, and `getCustomCaption` are commented stubs |
| `src/package.xml` | Mendix package metadata |
| `themesource/_variables.scss` | Module-level design tokens — `--ow-*` CSS custom properties with Atlas fallbacks; included automatically when the module is installed in a Mendix app |

### Data flow

1. **Mendix datasource → steps**: The `steps` datasource returns a list of objects. For each item, `stepTarget` (String attribute) provides the CSS selector, and `stepWidget` (Widgets slot) provides the tooltip content rendered as a React element.

2. **Selector formatting** (`formatSelector`): A bare word like `myId` is expanded to `#myId, .myId` to match either an ID or class. Otherwise the value is used as-is. Returns `null` for null/empty/undefined input; null steps are silently filtered from `joyrideSteps`.

3. **Tour state machine** (`tourReducer`): A `useReducer`-based state machine with **6 state variables**: `run`, `pendingStart`, `autoStarted`, `hasReportedFinish`, `hasReportedExit`, `prevTrigger`. Three `useEffect` hooks drive it:
   - **Auto-start**: When `triggerValue` is `undefined` and steps become ready → `START_TOUR` fires once (`autoStarted` flag prevents repeat). Resets `autoStarted` when steps disappear or a trigger is configured.
   - **Trigger-based**: `prevTrigger` tracks the previous render value. `false → true` edge → `START_TOUR` (or `SET_PENDING_START` if steps not ready yet). `true → false` edge → `STOP_TOUR + RESET_REPORTS`. The widget resets `runTrigger` to `false` when the tour ends.
   - **Pending resolution**: Fires `START_TOUR` when `stepsReady && pendingStart`; fires `STOP_TOUR` if steps disappear while the tour is running.

   An `actionReportedRef` (`{ finish, exit }`) provides an extra deduplication lock to prevent `onTourFinish`/`onTourExit` from firing twice before React re-renders.

4. **Styling**: `--ow-*` CSS custom properties are defined in `themesource/_variables.scss` (module-level, auto-included). They inherit from Atlas Design System tokens where available, with hardcoded fallbacks. Full token list: `--ow-primary`, `--ow-bg`, `--ow-text`, `--ow-text-muted`, `--ow-button-primary-text`, `--ow-radius`, `--ow-button-radius`, `--ow-overlay-color`, `--ow-tooltip-min-width`, `--ow-tooltip-max-width`, `--ow-tooltip-padding`, `--ow-tooltip-border-color`, `--ow-tooltip-shadow`, `--ow-button-height`, `--ow-font-size-body`, `--ow-font-size-button`, `--ow-font-size-fraction`, `--ow-dot-size`, `--ow-dot-inactive`, `--ow-animation-duration`. `OnboardingWidget.jsx` reads `--ow-primary` via `getComputedStyle` to pass to react-joyride's `styles.options.primaryColor`. A `stylesJson` text template can override any react-joyride `styles` object (shallow-merged over the default options).

5. **Progress indicator**: `showProgress` is bound to a Mendix enum with values `None`, `Dots`, `Step_Count`. `mapProgressIndicator` normalizes these to internal strings (`None → "none"`, `Dots → "dots"`, `Step_Count → "fraction"`), defaulting to `"dots"` if the value is absent. Joyride's native `showProgress` prop is always `false`; all progress rendering is handled by `CustomTooltip`. `progressMode` (Mendix enum: `Local` | `Global`) controls scope:
   - **Local**: `displayIndex = index`, `displayTotal = size` (steps on this widget instance).
   - **Global**: `displayIndex = stepOffset + index`, `displayTotal = totalStepCount`; `isLast` is recalculated as `(stepOffset + index + 1 === totalStepCount)`.

### Widget internals

**Helper functions**
- `formatSelector(raw)` — bare-word expansion via `/^[A-Za-z][\w-]*$/`; returns `null` on null, undefined, or empty input.
- `getAttributeValue(attribute, item)` — safe Mendix attribute extraction; guards against missing `get` function and checks for a `.value` property before returning.
- `tryExecuteAction(action)` — guards `canExecute` (defaults `true`) and `isExecuting` (defaults `false`) before calling `.execute()`; returns a boolean indicating whether it fired.
- `mapProgressIndicator(value)` — normalizes Mendix enum string → internal string; defaults to `"dots"`.

**`ObservedStepContent` component**
Wraps each step's widget content in a `div` with a `ResizeObserver`. On size change: fires `onResize` debounced via `requestAnimationFrame` (cancels any pending frame before scheduling a new one). Falls back gracefully if `ResizeObserver` is unavailable. Also fires `onResize` once on mount.

**`requestReposition`**
Calls `popperInstanceRef.current.update()` if a Popper instance is available. Otherwise dispatches a synthetic `resize` event on `window` (via `requestAnimationFrame` if available).

**`joyrideSteps` memo**
Iterates datasource items. For each item: calls `getAttributeValue → formatSelector` (skips if null), then `stepWidget.get(item)` (skips if null). Builds a joyride step object with `target`, `disableBeacon: true`, `content` (`ObservedStepContent` node), `floaterProps` (Popper getter via `handlePopper`), `className`, and `data.showProgress` (mapped progress indicator value).

**Loading / empty-state rendering**
- Returns `null` while `runTrigger` or `steps` datasources are in `"loading"` status.
- Returns an empty `<div>` (with widget class) if steps are available but all resolved to invalid (null target or null content).
- `<JoyrideComponent>` (wrapped in `<ErrorBoundary>`) is only mounted when `tourState.run === true`.

**`handleJoyride` callback**
Stops tour on `type === "tour:end"`, `status === STATUS.FINISHED`, `status === STATUS.SKIPPED`, or `action === ACTIONS.CLOSE`. Fires `onTourFinish` only when `status === STATUS.FINISHED` and `action !== ACTIONS.CLOSE`; fires `onTourExit` when `status === STATUS.SKIPPED || action === ACTIONS.CLOSE`. Both are deduplicated via `actionReportedRef` (ref lock set immediately before dispatching).

**Locale object**
Built from button-text props: `back → backButtonText`, `next → nextButtonText`, `close/last/skip → finishButtonText`. Passed to both `<JoyrideComponent>` and forwarded to `CustomTooltip`.

**Accessibility in `CustomTooltip`**
- Root div: `role="dialog"`, `aria-modal="true"`, `aria-label="Tour step N of M"` (using `displayIndex + 1` / `displayTotal`).
- `dialogRef` auto-focuses the tooltip div on mount and whenever `index` changes.
- `Escape` key via `onKeyDown` calls `closeProps.onClick`.
- Dots: each dot `<span>` has `role="img"`, `aria-label="Step N of M"`, `aria-current="step"` on the active dot.
- Fraction: `<span>` has `aria-live="polite"`.

### Mendix widget conventions

- The widget id is `kobeon.onboardingwidget.OnboardingWidget` (package path: `kobeon`).
- `needsEntityContext="true"` — the widget requires a Mendix entity context to resolve datasource and attribute properties.
- `offlineCapable="true"` — can be placed on offline Mendix pages.
- `supportedPlatform="Web"` — web only, not native mobile.
- Button-text props (`backButtonText`, `nextButtonText`, `finishButtonText`) have `defaultValue` in XML so they are always present and never `undefined`.
- Tooling is `@mendix/pluggable-widgets-tools` which provides webpack build, ESLint, and Prettier configs automatically.
- The `prettier.config.js` and `.eslintrc.js` at the root extend the tools' defaults.

## Mendix Module

This widget ships as part of the **Onboarding Module**. See `MODULE.md` for:
- Domain model (Onboarding, Page, Step, OnboardingAccount, OnboardingHelper)
- Microflow architecture (DS_OnboardingHelper, ACT_StartTour, SUB_ProgressToNextPage, ACT_TourExit)
- Snippet placement guide (SNP_Onboarding_Page)
- PageType enum pattern (how pages are identified across the tour)
- Multi-page progress offset (CurrentOffset ↔ stepOffset)
