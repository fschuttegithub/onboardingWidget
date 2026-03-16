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
| `src/ui/OnboardingWidget.scss` | SCSS styles using CSS custom properties (`--ow-primary`, `--ow-bg`, `--ow-text`, `--ow-radius`) |
| `src/OnboardingWidget.editorConfig.js` | Studio Pro editor hooks (`getProperties`, `check`, `getPreview`) — mostly stubs |
| `src/package.xml` | Mendix package metadata |

### Data flow

1. **Mendix datasource → steps**: The `steps` datasource returns a list of objects. For each item, `stepTarget` (String attribute) provides the CSS selector, and `stepWidget` (Widgets slot) provides the tooltip content rendered as a React element.
2. **Selector formatting** (`formatSelector`): A bare word like `myId` is expanded to `#myId, .myId` to match either an ID or class. Otherwise the value is used as-is.
3. **Tour state machine** (`tourReducer`): A `useReducer`-based state machine manages `run`, `pendingStart`, `autoStarted`, and reporting flags. Two modes:
   - **Auto-start**: No `runTrigger` configured → tour starts automatically when steps are ready.
   - **Trigger-based**: `runTrigger` is a Boolean Mendix attribute; the tour starts on `false → true` transition and stops on `true → false`. The widget resets `runTrigger` to `false` when the tour ends.
4. **Styling**: CSS custom properties are set on the container div from the `primaryColor`, `backgroundColor`, `textColor`, and `borderRadius` props. A `stylesJson` text template can override any react-joyride `styles` object.
5. **Progress indicator**: `showProgress` enum (`none` | `dots` | `fraction`) — dots and fraction are rendered by `CustomTooltip`; fraction also activates joyride's native `showProgress` prop.

### Mendix widget conventions

- The widget id is `kobeon.onboardingwidget.OnboardingWidget` (package path: `kobeon`).
- `needsEntityContext="true"` — the widget requires a Mendix entity context to resolve datasource and attribute properties.
- Tooling is `@mendix/pluggable-widgets-tools` which provides webpack build, ESLint, and Prettier configs automatically.
- The `prettier.config.js` and `.eslintrc.js` at the root extend the tools' defaults.
