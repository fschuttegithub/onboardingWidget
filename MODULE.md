# MODULE.md — Onboarding Module

This file documents the Mendix domain model, microflows, and snippet architecture for the **Onboarding Module** that ships alongside the `OnboardingWidget` pluggable widget.

For widget internals (React, joyride, state machine), see `CLAUDE.md`.

---

## Domain Model

### Entities

```
Onboarding           — tour configuration record
  Name (String)
  AutoStart (Boolean)
  Active (Boolean)
  TotalSteps (Integer)
  DisplayMode (Enumeration)
  ProgressIndicator (Enumeration)

Page                 — one Mendix page in the tour (1..* per Onboarding)
  PageType (Enumeration)  ← matches the enum value of the Mendix page the widget lives on
  Index (Integer)         ← order within the tour

Step                 — one tooltip on a page (1..* per Page)
  Index (Integer)
  Title (String)
  Description (String)
  ClassAnchor (String)    ← CSS selector / class name for the target element
  advanceOnClick (Boolean)

OnboardingAccount    — per-user tour instance (tracks progress)
  isActive (Boolean)
  CurrentOffset (Integer) ← total steps completed so far across all previous pages (= stepOffset for widget)

OnboardingHelper     — transient helper object; datasource for the snippet
  PageType (Enumeration)  ← the page type of the current Mendix page
  ShowButton (Boolean)    ← whether to show a manual-trigger button on this page
```

### Associations

| Association | Direction | Multiplicity |
|-------------|-----------|--------------|
| `OnboardingAccount_Onboarding` | OnboardingAccount → Onboarding | many-to-one |
| `OnboardingAccount_Account` | OnboardingAccount → Account | many-to-one |
| `OnboardingAccount_PageActive` | OnboardingAccount → Page | many-to-one (set by microflow on page advance) |
| `OnboardingHelper_OnboardingAccount` | OnboardingHelper → OnboardingAccount | many-to-one |
| `Page_Onboarding` | Page → Onboarding | many-to-one |
| `Step_Page` | Step → Page | many-to-one |

---

## PageType Pattern

Every Mendix page that hosts the onboarding widget has a corresponding `PageType` enum value. This enum is the linking key:

- `Page.PageType` identifies which `Page` record belongs to which Mendix page.
- `OnboardingHelper.PageType` tells the datasource microflow which page it is currently running on.

When configuring a new page in the tour, add a new `PageType` enum value and create a matching `Page` record in the `Onboarding` entity.

---

## Key Microflows

| Microflow | Purpose |
|-----------|---------|
| `DS_OnboardingHelper` | Retrieves/creates the `OnboardingHelper` for the current page and user |
| `ACT_StartTour` | Creates an `OnboardingAccount`, sets `OnboardingAccount_PageActive` to the first Page, sets `isActive = true` |
| `SUB_OnboardingAccount_ProgressToNextPage` | Called by `onTourFinish`: advances to next Page or marks tour complete |
| `ACT_TourExit` | Called by `onTourExit`: sets `isActive = false` (user abandoned tour) |
| `ACT_OpenAdminPage` | Opens admin pages based on `PageType` enum (e.g. `ConfigurationPage` → `Onboarding_Overview`, `OnboardingNewEdit` → `Onboarding_NewEdit`) |

### DS_OnboardingHelper (datasource microflow for the snippet)

Retrieves the correct `OnboardingHelper` for the current user and page:

1. Look for an existing **active** `OnboardingAccount` for this user → if found, return it (in-progress tour takes priority).
2. Otherwise, look for an `Onboarding` where `AutoStart = true` and `Active = true` with a `Page` matching the current `PageType` → start that tour.
3. Otherwise, look for an `Onboarding` where `Active = true` (no auto-start) with a matching page → set `ShowButton = true` so the manual trigger button appears.

### SUB_OnboardingAccount_ProgressToNextPage (detail)

```
OnboardingAccount (input)
  │
  ├─ Retrieve current Page via OnboardingAccount_PageActive
  ├─ Retrieve next Page from database ordered by Index (Index > current Page.Index)
  ├─ Next page exists?
  │    true  → Retrieve all Steps for pages before Page_Next (StepList_Offset)
  │           → Count them → Offset_Steps
  │           → Change OnboardingAccount:
  │               CurrentOffset = Offset_Steps
  │               OnboardingAccount_PageActive = Page_Next
  │           → Navigate to the Mendix page matching Page_Next.PageType
  │    false → Change OnboardingAccount: isActive = false  (tour complete)
  └─ End
```

`CurrentOffset` (stored on `OnboardingAccount`) is passed as `stepOffset` to the widget. This enables the **Global** progress mode to show correct step numbers across pages (e.g. step 3 of 7 when on page 2 of a multi-page tour).

---

## Snippet: SNP_Onboarding_Page

Place this snippet on every Mendix page that should show tour steps.

**Datasource**: `DS_OnboardingHelper` microflow → provides `OnboardingHelper` context object.

Inside the snippet the widget is configured as follows:

| Widget property | Value |
|----------------|-------|
| `steps` datasource | Database over `OnboardingAccount_PageActive` → retrieves `Step` objects for the currently active page |
| `stepTarget` | `Step.ClassAnchor` |
| `stepWidget` | Snippet/widget rendering `{Title}` and `{Description}` from `Step` |
| `stepOffset` | `OnboardingAccount.CurrentOffset` |
| `totalStepCount` | `Onboarding.TotalSteps` |
| `runTrigger` | Driven by a button (manual) or auto-start logic |
| `onTourFinish` | Calls `SUB_OnboardingAccount_ProgressToNextPage` |
| `onTourExit` | Calls `ACT_TourExit` |

The snippet also contains a conditionally visible button (visible when `OnboardingHelper.ShowButton = true`) that triggers `ACT_StartTour` for manual-start tours.

---

## Auto-advance Between Pages

When all steps on a page are completed, the widget fires `onTourFinish`, which calls `SUB_OnboardingAccount_ProgressToNextPage`. That microflow navigates to the next Mendix page, where the snippet loads fresh steps automatically. This creates a seamless multi-page tour without requiring user interaction between pages.

Steps with `advanceOnClick = true` advance the tour when the user clicks the highlighted element rather than the Next button.
