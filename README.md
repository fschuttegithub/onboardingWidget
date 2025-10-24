## OnboardingWidget (react-joyride)

This pluggable widget wraps `react-joyride` so Mendix developers can curate data-driven onboarding tours. Every aspect of the tour - start/stop, ordering, copy and optional callbacks - is steered straight from Mendix attributes.

### Mendix data contract
- **Steps** (`datasource`): list of step objects. Once available, the tour syncs automatically.
- **Target selector** (`stepTarget`): required string. A single word is converted into an ID selector (for example, `MainButton` becomes `#MainButton`). Provide a full selector (for example, `#save-btn`, `.page-header h1`) to use it verbatim.
- **Content** (`stepContent`): required string rendered inside the tooltip body.
- **Optional** mapping attributes:
  - `stepTitle`: tooltip heading.
  - `stepOrder`: numeric or textual ordering key; steps are sorted ascending when supplied.

### Controlling execution
- **Run trigger** (`runTrigger`): boolean attribute. Changing it from false to true immediately starts the tour (as soon as steps are available) and the widget suppresses the Joyride beacon. Each generated step also has `disableBeacon: true` so individual tooltips never show a beacon.
- The widget remembers when a trigger-cycle has already run; it will not re-run automatically until you set the trigger back to false (or the page re-evaluates the trigger).
- Tooltip transitions are rendered without animation (`floaterProps.disableAnimation`) to avoid the default fly-in effect between steps.

### Styling options
- **Custom styles JSON** (`stylesJson`): optional property that accepts the JSON object described in the [react-joyride styles documentation](https://docs.react-joyride.com/styles). Leave it empty to keep the library defaults; populate it to tweak colors, borders or layout without touching the widget code. Invalid JSON is ignored with a console warning.
- **Theme overrides**: check `src/ui/OnboardingWidget.scss` for ready-to-copy selectors (e.g. `.react-joyride__button--next`, `.react-joyride__tooltip`). Copy the rules you need into your Mendix theme and adapt colors, spacing, etc.

### Events
- **On tour finish**: called after the final step completes (only once per tour cycle).
- **On tour exit**: called when the user closes or skips the tour before finishing.

### Widget options
- `showProgress`: render a 2/5-style indicator.

### Development
1. Install dependencies: `npm install` (use `--legacy-peer-deps` if required by your npm version).
2. Start the dev server against your Mendix project: `npm start`.
3. Build the distributable package: `npm run build`.