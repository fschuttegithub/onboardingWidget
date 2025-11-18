## OnboardingWidget (react-joyride)

This pluggable widget wraps `react-joyride` so Mendix developers can curate data-driven onboarding tours. Every aspect of the tour - start/stop, copy, and optional callbacks - is steered straight from Mendix attributes.

### Configuration Groups

#### 1. General
Controls the overall behavior of the widget.
- **Run trigger** (`runTrigger`): Boolean attribute. When this value is `true`, the tour runs (assuming steps are available). If the user closes the tour, it will not re-open until the value is reset to `false` and back to `true`, or the page reloads.
- **Show progress** (`showProgress`): Choose how to display the progress indicator in the tooltip footer:
  - **Dots** (Default): Displays navigation dots.
  - **Step count**: Displays text like "1/3".
  - **None**: Hides the indicator.
- **On tour finish**: Action executed after the final step completes.
- **On tour exit**: Action executed when the user closes or skips the tour before finishing.

#### 2. Steps
Defines the content and targets for the tour.
- **Steps data source** (`steps`): List of step objects.
- **Target selector** (`stepTarget`): Required string attribute containing the CSS selector for the target element.
  - A single word (e.g., `MainButton`) is automatically converted to IDs and Classes (e.g., `#MainButton, .MainButton`).
  - Provide a full selector (e.g., `#save-btn`, `.page-header h1`) to use it verbatim.
- **Step content** (`stepWidget`): Required widget area. Place any Mendix widgets here to define the content of the tooltip body for each step.
  - **Note on Sorting**: The widget displays steps in the order provided by the datasource. Use the "Sort" option in your Database datasource or Microflow retrieval to control the sequence.

#### 3. Styling
Customize the look and feel to match your brand.
- **Primary color**: Main color for buttons and active dots.
- **Background color**: Background color of the tooltip card.
- **Text color**: Color of the text inside the tooltip.
- **Border radius**: Corner radius of the tooltip card (in pixels).
- **Custom styles JSON** (`stylesJson`): Optional property that accepts a JSON object described in the [react-joyride styles documentation](https://docs.react-joyride.com/styling).

#### 4. Text
Customize the labels for the navigation buttons.
- **Back button label**
- **Next button label**
- **Finish button label**

### Controlling execution
- The widget remembers when a trigger-cycle has already run; it will not re-run automatically until you set the trigger back to `false` (or the page re-evaluates the trigger).
- Tooltip transitions are rendered without animation (`floaterProps.disableAnimation`) to avoid the default fly-in effect between steps, providing a snappier feel.

### Development
1. Install dependencies: `npm install` (use `--legacy-peer-deps` if required by your npm version).
2. Start the dev server against your Mendix project: `npm start`.
3. Build the distributable package: `npm run build`.
