import { createElement, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { ACTIONS, EVENTS, STATUS } from "react-joyride";

import "./ui/OnboardingWidget.scss";
import { JoyrideComponent } from "./components/OnboardingWidgetComponent";
import { ErrorBoundary } from "./components/ErrorBoundary";

const WIDGET_CLASS = "onboarding-widget";
const TOOLTIP_CLASS = "onboarding-widget-tooltip";
const SIMPLE_SELECTOR_PATTERN = /^[A-Za-z][\w-]*$/;

const mapProgressIndicator = value => {
    if (!value) return "dots";
    const v = value.toLowerCase();
    return v === "step_count" ? "fraction" : v; // None→"none", Dots→"dots", Step_Count→"fraction"
};

const formatSelector = raw => {
    if (raw === null || raw === undefined) {
        return null;
    }

    const trimmed = `${raw}`.trim();
    if (!trimmed) {
        return null;
    }

    if (SIMPLE_SELECTOR_PATTERN.test(trimmed)) {
        const candidates = [`#${trimmed}`, `.${trimmed}`];
        return candidates.join(", ");
    }
    return trimmed;
};

const getAttributeValue = (attribute, item) => {
    if (!attribute || typeof attribute.get !== "function") {
        return undefined;
    }
    const value = attribute.get(item);
    return value && Object.prototype.hasOwnProperty.call(value, "value") ? value.value : undefined;
};

const ObservedStepContent = ({ children, onResize }) => {
    const containerRef = useRef(null);
    useEffect(() => {
        const node = containerRef.current;
        if (!node) {
            return undefined;
        }
        if (typeof onResize === "function") {
            onResize();
        }
        if (typeof ResizeObserver === "undefined") {
            return undefined;
        }
        let animationFrameId;
        const observer = new ResizeObserver(() => {
            if (typeof onResize !== "function") {
                return;
            }
            if (typeof requestAnimationFrame === "function") {
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                }
                animationFrameId = requestAnimationFrame(() => onResize());
            } else {
                onResize();
            }
        });
        observer.observe(node);
        return () => {
            if (animationFrameId && typeof cancelAnimationFrame === "function") {
                cancelAnimationFrame(animationFrameId);
            }
            observer.disconnect();
        };
    }, [onResize]);

    return (
        <div ref={containerRef} className={`${WIDGET_CLASS}__content`}>
            {children}
        </div>
    );
};

const createContentNode = (widgetContent, onResize, key) =>
    createElement(ObservedStepContent, { key, onResize }, widgetContent);

const tryExecuteAction = action => {
    if (!action || typeof action.execute !== "function") {
        return false;
    }

    const canExecute = action.canExecute ?? true;
    const isExecuting = action.isExecuting ?? false;

    if (canExecute && !isExecuting) {
        action.execute();
        return true;
    }

    return false;
};

const TOUR_ACTIONS = {
    START_TOUR: "START_TOUR",
    START_TOUR_AUTO: "START_TOUR_AUTO",
    STOP_TOUR: "STOP_TOUR",
    SET_PENDING_START: "SET_PENDING_START",
    RESET_AUTO_STARTED: "RESET_AUTO_STARTED",
    UPDATE_PREV_TRIGGER: "UPDATE_PREV_TRIGGER"
};

const tourReducer = (state, action) => {
    switch (action.type) {
        case TOUR_ACTIONS.START_TOUR:
            return {
                ...state,
                run: true,
                pendingStart: false
            };
        case TOUR_ACTIONS.STOP_TOUR:
            return {
                ...state,
                run: false,
                pendingStart: false
            };
        case TOUR_ACTIONS.SET_PENDING_START:
            return {
                ...state,
                pendingStart: true
            };
        case TOUR_ACTIONS.START_TOUR_AUTO:
            return {
                ...state,
                run: true,
                pendingStart: false,
                autoStarted: true
            };
        case TOUR_ACTIONS.RESET_AUTO_STARTED:
            return {
                ...state,
                autoStarted: false
            };
        case TOUR_ACTIONS.UPDATE_PREV_TRIGGER:
            return {
                ...state,
                prevTrigger: action.payload
            };
        default:
            return state;
    }
};

function OnboardingWidget(props) {
    const {
        steps,
        stepTarget,
        stylesJson,
        backButtonText,
        nextButtonText,
        finishButtonText,
        stepWidget,
        advanceOnClick,
        totalStepCount,
        stepOffset,
        progressMode
    } = props;

    const stepsAvailable = steps?.status === "available";
    const rawItems = stepsAvailable && Array.isArray(steps?.items) ? steps.items : undefined;

    const popperInstanceRef = useRef(null);
    const [stepIndex, setStepIndex] = useState(0);
    const joyrideHelpersRef = useRef(null);
    const programmaticAdvanceRef = useRef(false);
    const clickCleanupRef = useRef(null);
    const observerRef = useRef(null);
    const advanceTimeoutRef = useRef(null);

    const requestReposition = useCallback(() => {
        const instance = popperInstanceRef.current;
        if (instance && typeof instance.update === "function") {
            instance.update();
        }
    }, []);

    useEffect(
        () => () => {
            popperInstanceRef.current = null;
        },
        []
    );

    const advanceWithWait = useCallback((nextTarget, timeoutMs = 5000) => {
        if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }
        if (advanceTimeoutRef.current) {
            clearTimeout(advanceTimeoutRef.current);
        }

        const doAdvance = () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
            if (advanceTimeoutRef.current) {
                clearTimeout(advanceTimeoutRef.current);
                advanceTimeoutRef.current = null;
            }
            if (joyrideHelpersRef.current) {
                // Use helpers.next() so joyride fires its normal close-transition before advancing.
                // STEP_AFTER will then fire and our handler will increment stepIndex once.
                joyrideHelpersRef.current.next();
            } else {
                // Fallback if helpers aren't available yet (e.g. first step before getHelpers fires)
                programmaticAdvanceRef.current = true;
                setStepIndex(prev => prev + 1);
            }
        };

        // Check that the element is in the DOM AND has non-zero dimensions (i.e. visible, not inside a hidden tab)
        const isReady = selector => {
            if (!selector) return true;
            const el = document.querySelector(selector);
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 || rect.height > 0;
        };

        if (isReady(nextTarget)) {
            doAdvance();
            return;
        }

        // Watch for element to appear or become visible (handles both DOM insertion and CSS reveal)
        const observer = new MutationObserver(() => {
            if (isReady(nextTarget)) {
                doAdvance();
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "style", "hidden"]
        });
        observerRef.current = observer;

        advanceTimeoutRef.current = setTimeout(() => {
            doAdvance();
        }, timeoutMs);
    }, []);

    const cleanupClickListener = useCallback(() => {
        if (clickCleanupRef.current) {
            clickCleanupRef.current();
            clickCleanupRef.current = null;
        }
        if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }
        if (advanceTimeoutRef.current) {
            clearTimeout(advanceTimeoutRef.current);
            advanceTimeoutRef.current = null;
        }
    }, []);

    const handlePopper = useCallback(
        (popper, type) => {
            if (type === "tooltip") {
                popperInstanceRef.current = popper?.instance ?? null;
                requestReposition();
            } else if (popper?.instance && typeof popper.instance.update === "function") {
                popper.instance.update();
            }
        },
        [requestReposition]
    );

    const popperFloaterProps = useMemo(() => ({ getPopper: handlePopper }), [handlePopper]);

    const joyrideSteps = useMemo(
        () =>
            (rawItems ?? [])
                .map((item, idx) => {
                    const targetSelector = formatSelector(getAttributeValue(stepTarget, item));
                    if (!targetSelector) {
                        return null;
                    }

                    const widgetContent = stepWidget?.get?.(item);
                    if (widgetContent === null || widgetContent === undefined) {
                        return null;
                    }

                    const stepKey = item.id ?? `step-${idx}`;
                    const clickAdvance = getAttributeValue(advanceOnClick, item) ?? false;

                    return {
                        target: targetSelector,
                        disableBeacon: true,
                        content: createContentNode(widgetContent, requestReposition, stepKey),
                        floaterProps: popperFloaterProps,
                        className: TOOLTIP_CLASS,
                        data: {
                            showProgress: mapProgressIndicator(props.showProgress?.value),
                            advanceOnClick: clickAdvance
                        }
                    };
                })
                .filter(step => step !== null),
        [
            rawItems,
            stepTarget,
            stepWidget,
            advanceOnClick,
            requestReposition,
            popperFloaterProps,
            props.showProgress?.value
        ]
    );

    const stepsReady = joyrideSteps.length > 0;

    const triggerValue =
        props.runTrigger && props.runTrigger.status === "available" ? props.runTrigger.value === true : undefined;

    const [tourState, dispatch] = useReducer(tourReducer, {
        run: false,
        pendingStart: false,
        autoStarted: false,
        prevTrigger: false
    });

    const actionReportedRef = useRef({ finish: false, exit: false });

    useEffect(() => {
        if (!tourState.run) return;
        if (typeof document !== "undefined" && joyrideSteps.length > 0) {
            joyrideSteps.forEach(step => {
                if (step.target && !document.querySelector(step.target)) {
                    console.warn(`[OnboardingWidget] Target not found: "${step.target}"`);
                }
            });
        }
    }, [joyrideSteps, tourState.run]);

    // Handle trigger-based tour start/stop
    useEffect(() => {
        if (triggerValue === undefined) {
            return;
        }
        if (triggerValue && !tourState.prevTrigger) {
            actionReportedRef.current = { finish: false, exit: false }; // Reset ref for new tour run
            // Trigger changed from false to true - start tour
            if (stepsReady) {
                dispatch({ type: TOUR_ACTIONS.START_TOUR });
            } else {
                dispatch({ type: TOUR_ACTIONS.SET_PENDING_START });
            }
        } else if (!triggerValue && tourState.prevTrigger) {
            // Trigger changed from true to false - stop tour
            dispatch({ type: TOUR_ACTIONS.STOP_TOUR });
        }

        dispatch({ type: TOUR_ACTIONS.UPDATE_PREV_TRIGGER, payload: triggerValue });
    }, [triggerValue, stepsReady, tourState.prevTrigger, tourState.run]);

    // Handle auto-start when no trigger is configured
    useEffect(() => {
        if (triggerValue === undefined) {
            if (stepsReady && !tourState.autoStarted) {
                dispatch({ type: TOUR_ACTIONS.START_TOUR_AUTO });
            } else if (!stepsReady) {
                dispatch({ type: TOUR_ACTIONS.RESET_AUTO_STARTED });
            }
        } else {
            dispatch({ type: TOUR_ACTIONS.RESET_AUTO_STARTED });
        }
    }, [triggerValue, stepsReady, tourState.autoStarted]);

    // Handle pending start and steps readiness
    useEffect(() => {
        if (stepsReady && tourState.pendingStart) {
            dispatch({ type: TOUR_ACTIONS.START_TOUR });
        }

        if (!stepsReady && tourState.run) {
            dispatch({ type: TOUR_ACTIONS.STOP_TOUR });
        }
    }, [stepsReady, tourState.pendingStart, tourState.run]);

    const stylesOverride = useMemo(() => {
        if (!stylesJson || stylesJson.status !== "available") {
            return undefined;
        }
        const raw = (stylesJson.value ?? "").trim();
        if (!raw) {
            return undefined;
        }
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
                return parsed;
            }
            console.warn("[OnboardingWidget] Custom styles JSON must resolve to an object.");
        } catch (error) {
            console.warn("[OnboardingWidget] Unable to parse custom styles JSON.", error);
        }

        return undefined;
    }, [stylesJson]);

    const locale = useMemo(
        () => ({
            back: backButtonText,
            close: finishButtonText,
            last: finishButtonText,
            next: nextButtonText,
            skip: finishButtonText
        }),
        [backButtonText, nextButtonText, finishButtonText]
    );

    const handleJoyride = useCallback(
        data => {
            if (!data) {
                return;
            }
            const { status, type, action, index } = data;

            if (type === EVENTS.STEP_BEFORE) {
                cleanupClickListener();

                const step = joyrideSteps[index];
                if (step?.data?.advanceOnClick) {
                    const targetEl = document.querySelector(step.target);
                    if (targetEl) {
                        const nextStep = joyrideSteps[index + 1];
                        const nextTarget = nextStep?.target ?? null;
                        const captureHandler = e => {
                            const rect = targetEl.getBoundingClientRect();
                            const inBounds =
                                e.clientX >= rect.left &&
                                e.clientX <= rect.right &&
                                e.clientY >= rect.top &&
                                e.clientY <= rect.bottom;
                            if (inBounds) {
                                document.removeEventListener("click", captureHandler, true);
                                clickCleanupRef.current = null;
                                // If the overlay blocked the natural click (e.target is not inside the actual element),
                                // programmatically fire the click so Mendix processes it (e.g. opens the tab).
                                if (targetEl !== e.target && !targetEl.contains(e.target)) {
                                    targetEl.click();
                                }
                                // Defer so Mendix can finish processing the click before we check the next target
                                setTimeout(() => advanceWithWait(nextTarget), 0);
                            }
                        };
                        document.addEventListener("click", captureHandler, true);
                        clickCleanupRef.current = () => document.removeEventListener("click", captureHandler, true);
                    } else {
                        console.warn("[OW] advanceOnClick: target element not found in DOM for selector:", step.target);
                    }
                }
            }

            if (type === EVENTS.TOUR_START) {
                setStepIndex(0);
                cleanupClickListener();
            }

            if (type === EVENTS.TOUR_END) {
                cleanupClickListener();
            }

            // In controlled mode, we must update stepIndex on every NEXT/PREV action.
            // This covers both user button clicks and helpers.next() from doAdvance.
            if (type === EVENTS.STEP_AFTER) {
                if (action === ACTIONS.NEXT) {
                    // If we already incremented stepIndex programmatically (fallback path),
                    // consume the flag and skip to prevent double-increment / step-skipping.
                    if (programmaticAdvanceRef.current) {
                        programmaticAdvanceRef.current = false;
                    } else {
                        setStepIndex(prev => prev + 1);
                    }
                } else if (action === ACTIONS.PREV) {
                    setStepIndex(prev => Math.max(0, prev - 1));
                }
            }

            const exitRequested = status === STATUS.SKIPPED || action === ACTIONS.CLOSE;
            const shouldStop = type === "tour:end" || status === STATUS.FINISHED || exitRequested;
            if (shouldStop) {
                cleanupClickListener();
                dispatch({ type: TOUR_ACTIONS.STOP_TOUR });
            }
            if (status === STATUS.FINISHED && action !== ACTIONS.CLOSE && !actionReportedRef.current.finish) {
                actionReportedRef.current.finish = true; // Lock immediately
                tryExecuteAction(props.onTourFinish);
            }
            if (exitRequested && !actionReportedRef.current.exit) {
                actionReportedRef.current.exit = true; // Lock immediately
                tryExecuteAction(props.onTourExit);
            }
        },
        [props.onTourExit, props.onTourFinish, joyrideSteps, cleanupClickListener, advanceWithWait, setStepIndex]
    );

    // Merge styles: default joyride options < user JSON override
    const defaultJoyrideStyles = useMemo(
        () => ({
            options: {
                primaryColor:
                    getComputedStyle(document.documentElement).getPropertyValue("--ow-primary").trim() || "#2540AF",
                zIndex: 10000
            }
        }),
        []
    );

    const finalStyles = useMemo(() => {
        if (!stylesOverride) {
            return defaultJoyrideStyles;
        }
        // Shallow merge sufficient for options object
        return {
            ...defaultJoyrideStyles,
            ...stylesOverride,
            options: {
                ...defaultJoyrideStyles.options,
                ...(stylesOverride.options || {})
            }
        };
    }, [defaultJoyrideStyles, stylesOverride]);

    const containerStyle = props.style ?? {};

    const combinedClassName = `${WIDGET_CLASS}${props.class ? ` ${props.class}` : ""}`;

    const isLoading = props.runTrigger?.status === "loading" || props.steps?.status === "loading";
    if (isLoading) {
        return null; // Return nothing while Mendix is actively fetching data
    }

    if (!joyrideSteps.length) {
        return <div className={combinedClassName} style={containerStyle} tabIndex={props.tabIndex} />;
    }

    return (
        <div className={combinedClassName} style={containerStyle} tabIndex={props.tabIndex}>
            {tourState.run && (
                <ErrorBoundary>
                    <JoyrideComponent
                        run={true}
                        steps={joyrideSteps}
                        showProgress={false} // CustomTooltip handles all progress display
                        callback={handleJoyride}
                        styles={finalStyles}
                        locale={locale}
                        continuous
                        showSkipButton={false}
                        showBackButton={Boolean(backButtonText)}
                        stepIndex={stepIndex}
                        spotlightClicks={false}
                        disableOverlayClose={true}
                        getHelpers={helpers => {
                            joyrideHelpersRef.current = helpers;
                        }}
                        totalStepCount={totalStepCount?.value != null ? Number(totalStepCount.value) : null}
                        stepOffset={stepOffset?.value != null ? Number(stepOffset.value) : 0}
                        progressMode={(progressMode?.value ?? "local").toLowerCase()}
                    />
                </ErrorBoundary>
            )}
        </div>
    );
}

export default OnboardingWidget;
