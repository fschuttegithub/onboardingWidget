# Guided Tour – Multi-Page Tour

A Mendix pluggable widget that guides users through your application with step-by-step tooltip tours. Supports single-page and multi-page guided tour flows, fully driven by your Mendix data model.

Built on [react-joyride](https://docs.react-joyride.com/).

---

## Features

- Tooltip tours driven by a Mendix datasource — no hardcoded steps
- Any Mendix widget can be used as tooltip content (text, images, video, etc.)
- Trigger-based start: bind a Boolean attribute to launch the tour from a button, nanoflow, or page load
- Auto-start mode: tour starts automatically when no trigger is configured
- Multi-page support: display a continuous step counter (e.g. "Step 4/10") across multiple pages
- Progress indicator: none, dots, or step count (e.g. 1/3)
- Fully customizable appearance: colors, border radius, button labels, and a JSON escape hatch for advanced styling

---

## Requirements

- Mendix Studio Pro 9.x or higher
- The following enumerations in your domain model (see setup below):
  - `Enum_ProgressIndicator`
  - `Enum_DisplayMode`

---

## Installation

1. Download the `.mpk` from the Mendix Marketplace and import it into your project.
2. Create the required enumerations (see below).
3. Create an entity to hold your tour configuration and step data.
4. Drop the widget on a page and configure the properties.

---

## Required Enumerations

Create these two enumerations in your domain model before binding the widget properties.

### Enum_ProgressIndicator

Controls which progress indicator style is shown in the tooltip footer.

| Caption    | Name       |
|------------|------------|
| None       | None       |
| Dots       | Dots       |
| Step Count | Step_Count |

### Enum_DisplayMode

Controls whether the step counter counts steps on the current page only, or globally across all pages.

| Caption | Name   |
|---------|--------|
| Local   | Local  |
| Global  | Global |

---

## Widget Properties

### Tour tab

| Property       | Type    | Required | Description |
|----------------|---------|----------|-------------|
| Run trigger    | Boolean | No       | When `true`, the tour starts. The widget automatically resets this to `false` when the tour ends. Leave unbound for auto-start on page load. |
| On tour finish | Action  | No       | Runs after the user completes the last step. |
| On tour exit   | Action  | No       | Runs when the user closes or skips the tour before finishing. |

### Steps tab

| Property           | Type       | Required | Description |
|--------------------|------------|----------|-------------|
| Steps data source  | Datasource | Yes      | List of objects, one per tour step. |
| Target selector    | String     | Yes      | CSS selector for the element this step points to (e.g. `.my-button` or `#header`). A plain word like `myId` is automatically expanded to `#myId, .myId`. |
| Step content       | Widgets    | No       | Any Mendix widget(s) to render inside the tooltip for this step. |

### Progress tab

| Property           | Type    | Required | Description |
|--------------------|---------|----------|-------------|
| Progress indicator | Enum    | No       | Bind to `Enum_ProgressIndicator`. `None` hides it, `Dots` shows navigation dots, `Step_Count` shows e.g. "2/5". Defaults to `Dots`. |
| Progress scope     | Enum    | No       | Bind to `Enum_DisplayMode`. `Local` counts steps on this page; `Global` counts across all pages using the offset and total below. Defaults to `Local`. |
| Total step count   | Integer | No       | Total number of steps across all pages. Required when Progress scope is `Global`. |
| Step offset        | Integer | No       | Steps completed on previous pages (0 for the first page). Required when Progress scope is `Global`. |

### Appearance tab

#### Colors & Shape

| Property         | Type    | Default   | Description |
|------------------|---------|-----------|-------------|
| Primary color    | String  | `#2540AF` | Color used for buttons and active indicators. Accepts any CSS color value. |
| Background color | String  | `#ffffff` | Tooltip card background color. |
| Text color       | String  | `#333333` | Text color inside the tooltip. |
| Border radius    | Integer | `8`       | Corner radius of the tooltip card in pixels. |

#### Button Labels

| Property | Default  | Description |
|----------|----------|-------------|
| Back     | `Back`   | Label for the Back button. |
| Next     | `Next`   | Label for the Next button. |
| Finish   | `Finish` | Label for the button on the last step. |

#### Advanced

| Property             | Type          | Description |
|----------------------|---------------|-------------|
| Custom styles (JSON) | Text template | Override any react-joyride style object. See [react-joyride styling docs](https://docs.react-joyride.com/styling) for the full structure. |

---

## How to Set Up a Tour

### Single-page tour (auto-start)

1. Create an entity (e.g. `TourStep`) with a `String` attribute for the CSS selector.
2. Create a datasource (e.g. a microflow) that returns the list of steps in the desired order.
3. Drop the widget on the page, bind **Steps data source**, **Target selector**, and **Step content**.
4. Leave **Run trigger** unbound — the tour starts automatically when steps are loaded.

### Trigger-based start

1. Add a `Boolean` attribute (e.g. `StartTour`) to your page's context entity, defaulting to `false`.
2. Bind **Run trigger** to `StartTour`.
3. Use a button or nanoflow to set `StartTour = true` — the tour launches immediately.
4. The widget resets `StartTour` to `false` automatically when the tour ends.
5. To replay, set `StartTour = true` again.

### Multi-page tour

Use this when your tour spans multiple Mendix pages and you want a continuous step counter (e.g. "Step 3/10").

1. Add `TotalStepCount` (Integer) and `StepOffset` (Integer) attributes to your context entity.
2. Set `TotalStepCount` to the total number of steps across all pages (e.g. `10`).
3. Set `StepOffset` to the number of steps already completed on previous pages (e.g. `0` on page 1, `3` on page 2).
4. Set **Progress indicator** to `Step_Count` and **Progress scope** to `Global`.
5. Bind **Total step count** and **Step offset** to the attributes above.
6. Navigate between pages with your normal nanoflow/microflow logic — the widget reads the updated offset on each page.

---

## CSS Selector Tips

The **Target selector** attribute accepts any valid CSS selector.

| Value         | What it targets |
|---------------|-----------------|
| `myButton`    | Expands to `#myButton, .myButton` |
| `.my-class`   | Elements with class `my-class` |
| `#my-id`      | Element with id `my-id` |
| `[data-step]` | Elements with a `data-step` attribute |

The simplest approach is to add a **CSS class** to your target widget in Studio Pro and reference it as `.my-class`.

---

## Controlling the Tour

- The widget tracks each trigger cycle. The tour will not restart automatically until `Run trigger` is reset to `false` and back to `true`.
- Tooltip transitions use no animation by default for a snappier feel between steps.
- Step order is determined by the sort order of your datasource. Use the **Sort** option in your database retrieval or microflow to control the sequence.

---

## Development

```bash
# Install dependencies
npm install

# Live reload against a local Mendix app (expected at http://localhost:8080)
npm run dev

# Production build — outputs .mpk to the Mendix project two levels up
npm run build

# Release build (lint + package)
npm run release

# Lint
npm run lint
npm run lint:fix
```
