# OnboardingWidget: architecture review and implementation guide

**The widget's core architecture is sound but needs three critical upgrades**: controlled-mode step management for the new click-step feature, MutationObserver-based DOM readiness detection, and server-persisted state recovery for multi-page resilience. The current separation of concerns—Mendix handling state via domain model and microflows while the widget handles presentation via react-joyride—is a strong pattern. However, the widget's internal `useReducer` state is fragile across page navigations (all React state is destroyed when Mendix navigates between pages in its SPA architecture), and the click-step feature demands async interception capabilities that react-joyride doesn't natively provide. This report provides specific implementation patterns for each area.

---

## 1. Architecture holds up well but has SPA state fragility

The separation between Mendix platform logic (domain model, microflows) and widget presentation logic (react-joyride wrapper) follows the recommended **container/display component pattern** for Mendix pluggable widgets. The domain model design with Onboarding → OnboardingPage → Steps hierarchy, linked to accounts via OnboardingAccount, correctly models the multi-page tour concept.

**The critical architectural vulnerability is state loss during navigation.** Mendix apps are SPAs—the `Show Page` activity replaces page content without a full browser reload, but it **unmounts all React components on the current page**. This means the widget's `useReducer` state is destroyed not just on browser refresh, but on every page-to-page transition in the multi-page onboarding flow. The datasource microflow re-executes on each page load, which is the correct recovery mechanism, but the widget must be designed to reconstruct its tour state entirely from Mendix attributes on mount.

**Domain model assessment.** The planned `TotalSteps` attribute on the Onboarding entity is the right call. Mendix calculated attributes trigger on every retrieve and always degrade performance—**denormalized stored values updated via microflow are the documented best practice**. The OnboardingAccount entity effectively serves as a join table with state, linking Account to Onboarding with progress tracking. Adding a `CurrentGlobalStepOffset` integer attribute (sum of steps on all previous pages) would let the widget compute global progress without additional retrieval logic.

**PageType enum scalability.** The current approach using an enumeration for page routing in the `Onboarding_Continue` microflow works well for a bounded set of pages. Mendix enums have no documented hard limit and store as strings in the database. However, **every new page type requires a model change and redeployment**. For onboardings that will evolve frequently, consider a hybrid: keep the enum for type safety in Studio Pro but store a string page identifier on the OnboardingPage entity that the widget uses internally. This decouples the widget's routing logic from the enum definition.

**Microflow pattern review.** The `DS_OnboardingAccount_Retrieve` → check isActive → create or return pattern is correct. The `Onboarding_Continue` microflow with `Show Page` activities is the standard Mendix wizard pattern. One improvement: **use nanoflows instead of microflows for page transitions** where possible, as nanoflows execute client-side without a server round-trip, reducing latency between steps. Reserve microflows for operations requiring database commits or complex security checks.

---

## 2. Click-step implementation requires controlled mode and MutationObserver

The click-step feature—where the tour programmatically clicks a DOM element (like a tab header), waits for the DOM to update, then shows the next tooltip—is achievable but requires careful orchestration. React-joyride has **no built-in `beforeShowPromise` or async step interception**. The solution is to use controlled mode with the `stepIndex` prop and implement a pause-click-wait-resume pattern.

### How react-joyride controlled mode enables async operations

In controlled mode (when `stepIndex` is set as a prop), react-joyride does not auto-advance steps. The widget must respond to the `EVENTS.STEP_AFTER` callback by updating `stepIndex`. This creates a natural interception point:

```jsx
const handleJoyrideCallback = async (data) => {
    const { action, index, type, status } = data;

    if ([EVENTS.STEP_AFTER, EVENTS.TARGET_NOT_FOUND].includes(type)) {
        const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);
        const nextStepConfig = stepsConfig[nextIndex];

        if (nextStepConfig?.stepType === "Click") {
            // 1. Pause the tour
            setRun(false);
            
            // 2. Programmatically click the target element
            const clickTarget = document.querySelector(nextStepConfig.clickTarget);
            if (clickTarget) {
                clickTarget.click();
            }
            
            // 3. Wait for the NEXT step's target to appear in the DOM
            const showStepIndex = nextIndex + 1;
            const showStepTarget = stepsConfig[showStepIndex]?.target;
            
            try {
                await waitForElement(showStepTarget, { timeout: 5000 });
            } catch (e) {
                console.warn(`Target ${showStepTarget} not found after click, skipping`);
            }
            
            // 4. Skip the click step, advance to the show step
            setStepIndex(showStepIndex);
            setTimeout(() => setRun(true), 100);
        } else {
            setStepIndex(nextIndex);
        }
    } else if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
        setRun(false);
        onTourFinishAction?.execute();
    }
};
```

### The `waitForElement` utility using MutationObserver

MutationObserver is **88x faster than setTimeout polling** for detecting DOM changes (measured in benchmarks comparing microtask vs macrotask detection). The hybrid approach below combines MutationObserver with a polling fallback and timeout safety net:

```javascript
function waitForElement(selector, { timeout = 5000, root = document.body } = {}) {
    return new Promise((resolve, reject) => {
        // Always check if element already exists first
        const existing = root.querySelector(selector);
        if (existing) { resolve(existing); return; }

        let done = false;
        const finish = (el) => {
            if (done) return;
            done = true;
            observer.disconnect();
            clearInterval(pollId);
            clearTimeout(timeoutId);
            if (el) resolve(el);
            else reject(new Error(`"${selector}" not found within ${timeout}ms`));
        };

        // Primary: MutationObserver catches insertions instantly
        const observer = new MutationObserver(() => {
            const found = root.querySelector(selector);
            if (found) finish(found);
        });
        observer.observe(root, { childList: true, subtree: true });

        // Secondary: polling catches attribute-only changes MO might miss
        const pollId = setInterval(() => {
            const found = root.querySelector(selector);
            if (found) finish(found);
        }, 250);

        // Safety net: timeout prevents zombie observers
        const timeoutId = setTimeout(() => finish(null), timeout);
    });
}
```

**Why the hybrid approach matters for Mendix:** Mendix tab containers **pre-render all tab content in the DOM** but hide inactive tabs via CSS (`display: none`). When you click a tab, the `active` class moves and the tab pane becomes visible. However, widgets inside the tab may need to fetch data asynchronously (especially with XPath/database datasources). The MutationObserver catches the DOM insertion, while the polling fallback catches cases where the element exists but becomes queryable only after a class/attribute change.

### Mendix tab container DOM behavior

Mendix tab containers use a Bootstrap-derived structure. The critical selectors are:

- `.mx-tabcontainer` — outer container
- `.nav-link` — clickable tab header
- `.nav-link.active` — currently active tab
- `.tab-pane.active` — visible tab content panel

When clicking a tab programmatically with `element.click()`, this works because **Mendix uses React's event delegation system** (attached at the root container since React 17), and native click events bubble up correctly. The established pattern in the Mendix community for programmatic clicks is simply `document.querySelector('.mx-name-tabPage1 .nav-link').click()`.

### Recommended click-step design: invisible bridge step

The cleanest implementation treats a click-step as an **invisible bridge** between two visible tooltip steps. The click-step itself never shows a tooltip—it's a configuration entry that triggers the click and wait, then the next step shows the tooltip on the newly revealed content.

Add a `StepType` enumeration to the Steps entity in Mendix with values `Highlight` and `Click`. For Click steps, add a `ClickTarget` string attribute containing the CSS selector of the element to click. The widget processes click-steps by executing the click, waiting for the subsequent step's target to appear, then skipping ahead:

```xml
<!-- Additional widget XML properties for click-step support -->
<property key="stepType" type="attribute" dataSource="stepsData" required="false">
    <caption>Step type</caption>
    <description>Highlight (show tooltip) or Click (programmatic click)</description>
    <attributeTypes>
        <attributeType name="Enum"/>
    </attributeTypes>
</property>
<property key="clickTarget" type="attribute" dataSource="stepsData" required="false">
    <caption>Click target selector</caption>
    <description>CSS selector for element to click (Click steps only)</description>
    <attributeTypes>
        <attributeType name="String"/>
    </attributeTypes>
</property>
```

### Known react-joyride limitation to work around

**Issue #241** documents that `getStepTargetElement` for the next step is called *before* the `step:after` callback fires. This means if your callback triggers a DOM change (like clicking a tab), the target check happens too early and returns `TARGET_NOT_FOUND`. The solution is the pause-and-resume pattern above: set `run = false` to prevent react-joyride from checking the next target, perform the click, wait for the element, then set `run = true` with the updated `stepIndex`. The **100ms `setTimeout` before re-enabling `run`** is a widely-used pattern that gives React time to reconcile the DOM before react-joyride recalculates positions.

---

## 3. Global step count requires two new integer attributes and a tooltip modification

The global progress feature ("Step X of Y" across all pages) requires passing two values from Mendix to the widget: the **total step count** across the entire onboarding, and the **global offset** for the current page (the sum of steps on all previous pages).

### Widget XML additions

```xml
<property key="totalSteps" type="expression" defaultValue="">
    <caption>Total steps (all pages)</caption>
    <description>Total number of steps across all onboarding pages</description>
    <returnType type="Integer"/>
</property>
<property key="globalStepOffset" type="expression" defaultValue="">
    <caption>Global step offset</caption>
    <description>Number of steps on all previous pages (for global numbering)</description>
    <returnType type="Integer"/>
</property>
```

Using `type="expression"` with `returnType="Integer"` allows the Mendix modeler to pass a calculated expression, a literal value, or an attribute reference. The `TotalSteps` value comes from the stored attribute on the Onboarding entity. The `globalStepOffset` should be calculated in the datasource microflow by aggregating steps on all OnboardingPages with an Index less than the current page's Index.

### Mendix-side calculation

In the datasource microflow or a sub-microflow called during page transitions:

1. Retrieve all OnboardingPages associated with the current Onboarding, sorted by Index
2. For each page with Index < current page Index, sum the count of associated Steps
3. Pass this sum as the `globalStepOffset` expression value

Store `TotalSteps` on the Onboarding entity and update it via a microflow whenever steps are added or removed. **Never use a calculated attribute**—the performance penalty of recalculating on every retrieve is not worth it for a value that changes rarely.

### CustomTooltip modification

```jsx
function CustomTooltip({ 
    index, size, step, continuous, isLastStep,
    backProps, primaryProps, closeProps, tooltipProps,
    // Custom props passed via step.data
}) {
    // Access global progress from step.data (set during step construction)
    const globalIndex = step.data?.globalOffset + index;
    const globalTotal = step.data?.totalSteps || size;
    
    // Auto-switch from dots to fraction when total exceeds threshold
    const progressMode = globalTotal > 8 ? "fraction" : "dots";
    
    return (
        <div className="onboarding-tooltip" {...tooltipProps}>
            <button className="tooltip-close" {...closeProps}>×</button>
            <div className="tooltip-content">{step.content}</div>
            <div className="tooltip-footer">
                <div className="tooltip-progress">
                    {progressMode === "fraction" ? (
                        <span>{globalIndex + 1} / {globalTotal}</span>
                    ) : (
                        <div className="tooltip-dots">
                            {Array.from({ length: globalTotal }, (_, i) => (
                                <span 
                                    key={i} 
                                    className={`dot ${i === globalIndex ? 'active' : ''} 
                                               ${i < globalIndex ? 'completed' : ''}`} 
                                />
                            ))}
                        </div>
                    )}
                </div>
                <div className="tooltip-buttons">
                    {index > 0 && <button {...backProps}>Back</button>}
                    {continuous && <button {...primaryProps}>
                        {isLastStep ? 'Finish' : 'Next'}
                    </button>}
                </div>
            </div>
        </div>
    );
}
```

The key insight: react-joyride's custom tooltip component cannot receive arbitrary props directly. **Use `step.data` to pass the global offset and total steps** when constructing the steps array:

```jsx
const joyrideSteps = stepsFromMendix.map((step, i) => ({
    target: step.classAnchor,
    content: step.description,
    disableBeacon: true,
    data: {
        globalOffset: globalStepOffset,   // from Mendix expression prop
        totalSteps: totalSteps,           // from Mendix expression prop
        stepType: step.stepType,
        clickTarget: step.clickTarget,
    }
}));
```

**Threshold recommendation for dots vs. fraction:** Switch to fraction display when total steps exceeds **8**. Beyond 8 dots, the visual indicator becomes cluttered and loses its ability to convey position at a glance. At 8 or fewer, dots provide an elegant, scannable progress indicator.

---

## 4. Risk assessment reveals five priority fixes

### Console.log statements must be conditional

Every `console.log` in the production widget fires on every user's browser. Replace all logging with a conditional utility:

```jsx
const createLogger = (debugMode) => ({
    log: (...args) => debugMode && console.log("[OnboardingWidget]", ...args),
    warn: (...args) => debugMode && console.warn("[OnboardingWidget]", ...args),
    error: (...args) => console.error("[OnboardingWidget]", ...args), // always log errors
});
```

Add a `enableDebugMode` boolean property to the widget XML. In production, all log/warn calls become no-ops while errors always surface.

### Boolean trigger race conditions need a ref guard

The `runTrigger` boolean useEffect pattern has a race condition: if Mendix attributes load asynchronously (they always do), the initial render sees `undefined`, then the value arrives as `true`, potentially triggering multiple tour starts if other attributes update simultaneously. Add a ref-based guard:

```jsx
const tourActiveRef = useRef(false);
const stepsSnapshotRef = useRef(null);

useEffect(() => {
    if (props.runTrigger?.value === true && !tourActiveRef.current) {
        tourActiveRef.current = true;
        // Snapshot the step configuration to prevent mid-tour mutations
        stepsSnapshotRef.current = buildStepsFromProps(props);
        dispatch({ type: 'START' });
    } else if (props.runTrigger?.value === false && tourActiveRef.current) {
        tourActiveRef.current = false;
        dispatch({ type: 'STOP' });
    }
}, [props.runTrigger?.value]);
```

**Snapshotting steps on tour start** is critical. If the Mendix datasource refreshes mid-tour (due to a `Refresh in Client` activity or re-navigation), the live props could change underneath the running tour. Working from a captured snapshot prevents mid-tour step array mutations.

### MutationObserver and event listener cleanup

Every `MutationObserver`, `setTimeout`, `setInterval`, and DOM event listener created in `useEffect` must have a cleanup return. Missing cleanups cause memory leaks, especially in Mendix's SPA where page navigation unmounts and remounts widgets frequently:

```jsx
useEffect(() => {
    const observer = new MutationObserver(callback);
    observer.observe(document.body, { childList: true, subtree: true });
    const timeoutId = setTimeout(someAction, 5000);
    
    return () => {
        observer.disconnect();   // Critical: prevent zombie observers
        clearTimeout(timeoutId);
    };
}, [dependencies]);
```

### Error boundary prevents widget crashes from breaking the page

A react-joyride error (missing target, positioning failure) should not crash the entire Mendix page. Wrap the widget in an error boundary:

```jsx
class OnboardingErrorBoundary extends Component {
    state = { hasError: false };
    
    static getDerivedStateFromError(error) {
        return { hasError: true };
    }
    
    componentDidCatch(error, errorInfo) {
        console.error("[OnboardingWidget] Render error:", error, errorInfo);
    }
    
    render() {
        if (this.state.hasError) return null; // Silently fail - don't break the page
        return this.props.children;
    }
}
```

### The `floaterProps: { disableAnimation: true }` approach is correct

Disabling animation is the right choice for a programmatic tour widget. It eliminates CSS transition-induced reflows during rapid step changes (especially relevant for click-steps where the tour pauses and resumes quickly). The only trade-off is a slightly less polished appearance, which is acceptable for functional onboarding. Keep this setting.

### Accessibility improvements needed

The widget should add these accessibility features:

- **Focus management**: Save `document.activeElement` before tour starts, restore it on tour end. Move focus to the tooltip on each step.
- **`aria-live="polite"` region**: Announce step changes to screen readers with a hidden div: `<div aria-live="polite" className="sr-only">Step {current} of {total}: {stepTitle}</div>`
- **Keyboard support**: Escape to dismiss, Tab/Shift+Tab within tooltip, Enter/Space for buttons. React-joyride's custom tooltip already receives proper ARIA attributes via `tooltipProps` (includes `aria-modal` and `role`).
- **`prefers-reduced-motion` respect**: Check `window.matchMedia('(prefers-reduced-motion: reduce)')` and disable all animations when the user has this preference set.

---

## 5. Multi-page resilience requires state reconstruction on mount

The most important architectural pattern for multi-page onboarding robustness is **state reconstruction from Mendix attributes on widget mount**. Since all React state is lost on every page navigation (not just browser refresh), the widget must treat every mount as a potential resume.

### State recovery pattern

```jsx
useEffect(() => {
    // Mendix attributes load asynchronously - wait for them
    if (props.onboardingAccount?.status !== "available") return;
    if (props.stepsData?.status !== "available") return;
    
    const isActive = props.isActive?.value === true;
    const steps = buildStepsFromDatasource(props.stepsData, props.stepSelectors);
    
    if (isActive && steps.length > 0) {
        // Tour should be running on this page
        stepsSnapshotRef.current = steps;
        dispatch({ type: 'INITIALIZE', payload: { steps } });
        // Small delay to ensure DOM elements targeted by steps exist
        setTimeout(() => dispatch({ type: 'START' }), 200);
    }
}, [props.onboardingAccount?.status, props.stepsData?.status]);
```

The datasource microflow (`DS_OnboardingAccount_Retrieve`) is the single source of truth. If it returns an active OnboardingAccount, the widget starts the tour for the current page's steps. If it returns nothing, no tour runs. This pattern handles all scenarios:

- **Fresh start**: Microflow creates OnboardingAccount, returns it, widget starts
- **Page transition**: Microflow returns existing active OnboardingAccount, widget starts with current page's steps
- **Browser refresh**: Session persists, microflow re-executes, returns active OnboardingAccount, widget resumes
- **Completed user**: Microflow finds OnboardingAccount with isActive=false, returns nothing, no tour

### Handling the "wrong page" edge case

If a user bookmarks or refreshes and lands on a page that doesn't match their current onboarding page, the datasource microflow should detect this. Add the current page identifier to the PageHelper non-persistent entity (or use a widget property). In the microflow, compare the current page with the OnboardingPage associated with the OnboardingAccount. If they don't match, either navigate to the correct page or skip silently.

### Multi-page `Onboarding_Continue` improvements

The current pattern of using `Show Page` activities with a PageType enum exclusive split works but consider these improvements:

- **Use nanoflows for the `Show Page` call** to avoid a server round-trip for navigation
- **Commit the OnboardingAccount state change** (updating the active OnboardingPage association) in a separate microflow *before* the nanoflow navigates, ensuring the database reflects the new state before the next page loads
- **Add a "Dismiss" path** alongside "Complete"—users who close the tour mid-flow should have `isActive` set to `false` with a separate status indicator (e.g., a `Dismissed` boolean) so they can be offered the tour again later

### Concurrent session handling

If the same user opens the onboarding in two browser tabs, both tabs share the same Mendix session and will retrieve the same OnboardingAccount. Advancing in one tab writes to the database but doesn't automatically refresh the other tab's widget. **The practical recommendation**: treat this as a low-priority edge case. Make step completion idempotent (completing step 3 twice is harmless), and if the datasource refreshes in the stale tab, it will show the correct state.

---

## Lessons from Shepherd.js and Driver.js for the click-step design

Shepherd.js provides the best architectural inspiration for the click-step feature through two mechanisms the widget should emulate. **`beforeShowPromise`** is an async hook that delays step rendering until a promise resolves—the widget's pause-click-wait-resume pattern achieves the same effect. **`advanceOn`** allows a step to advance when a specific DOM event fires on a specific element—this could be implemented as an optional `AdvanceOnClick` boolean on the Steps entity, where the tooltip stays visible until the user actually clicks the target element (for interactive walkthroughs where user agency matters).

Driver.js adds another useful pattern: when overriding `onNextClick`, the developer takes full control of navigation and must explicitly call `moveNext()`. This maps directly to react-joyride's controlled mode, where the callback must update `stepIndex` to advance.

The key design decision is whether click-steps should be **automatic** (system clicks for the user) or **interactive** (user must click). For the Mendix tab container use case, automatic is better—the click is a mechanical prerequisite (opening a tab) rather than the learning objective. The invisible bridge step pattern described in section 2 handles this cleanly. For future feature tours where the click *is* the learning objective, add the `AdvanceOnClick` option that shows a tooltip ("Click this button") and waits for the user's actual click via an event listener.

---

## Conclusion

The OnboardingWidget's architecture is fundamentally well-designed, with Mendix correctly owning state and the widget owning presentation. Three changes will make it production-ready and enable the requested features. **First**, switch react-joyride to controlled mode with `stepIndex` to unlock async step interception for click-steps—this is non-negotiable since react-joyride offers no `beforeShowPromise` hook. **Second**, implement the hybrid `waitForElement` utility combining MutationObserver with polling fallback, targeting the narrowest possible DOM container rather than `document.body`. **Third**, treat every widget mount as a potential resume by reconstructing state entirely from Mendix attributes, never relying on React state to survive page transitions.

The click-step should be modeled as an invisible bridge step with a `StepType` enum (`Highlight`/`Click`) on the Steps entity. The `100ms setTimeout` before re-enabling `run` after DOM mutations is a battle-tested pattern across the react-joyride community. For global progress, pass `totalSteps` and `globalStepOffset` as expression properties and inject them into steps via `step.data`. Auto-switch from dots to fraction display at 8+ total steps. Finally, wrap everything in an error boundary, gate console logging behind a debug property, guard the boolean trigger with a ref, and add basic ARIA support to the custom tooltip.