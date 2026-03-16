import { createElement, useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import classNames from "classnames";
import { ACTIONS, STATUS } from "react-joyride";

import "./ui/OnboardingWidget.scss";
import { JoyrideComponent } from "./components/OnboardingWidgetComponent";

const WIDGET_CLASS = "onboarding-widget";
const TOOLTIP_CLASS = "onboarding-widget-tooltip";
const SIMPLE_SELECTOR_PATTERN = /^[A-Za-z][\w-]*$/;

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
    STOP_TOUR: "STOP_TOUR",
    SET_PENDING_START: "SET_PENDING_START",
    CLEAR_PENDING_START: "CLEAR_PENDING_START",
    MARK_AUTO_STARTED: "MARK_AUTO_STARTED",
    RESET_AUTO_STARTED: "RESET_AUTO_STARTED",
    REPORT_FINISH: "REPORT_FINISH",
    REPORT_EXIT: "REPORT_EXIT",
    RESET_REPORTS: "RESET_REPORTS",
    UPDATE_PREV_TRIGGER: "UPDATE_PREV_TRIGGER"
};

const tourReducer = (state, action) => {
    switch (action.type) {
        case TOUR_ACTIONS.START_TOUR:
            return {
                ...state,
                run: true,
                pendingStart: false,
                hasReportedFinish: false,
                hasReportedExit: false
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
        case TOUR_ACTIONS.CLEAR_PENDING_START:
            return {
                ...state,
                pendingStart: false
            };
        case TOUR_ACTIONS.MARK_AUTO_STARTED:
            return {
                ...state,
                autoStarted: true
            };
        case TOUR_ACTIONS.RESET_AUTO_STARTED:
            return {
                ...state,
                autoStarted: false
            };
        case TOUR_ACTIONS.REPORT_FINISH:
            return {
                ...state,
                hasReportedFinish: true
            };
        case TOUR_ACTIONS.REPORT_EXIT:
            return {
                ...state,
                hasReportedExit: true
            };
        case TOUR_ACTIONS.RESET_REPORTS:
            return {
                ...state,
                hasReportedFinish: false,
                hasReportedExit: false
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
        BackButtonText,
        NextButtonText,
        FinishButtonText,
        stepWidget,
        primaryColor,
        backgroundColor,
        textColor,
        borderRadius
    } = props;

    const stepsAvailable = steps?.status === "available";
    const rawItems = stepsAvailable && Array.isArray(steps?.items) ? steps.items : undefined;

    const popperInstanceRef = useRef(null);

    const requestReposition = useCallback(() => {
        const instance = popperInstanceRef.current;
        if (instance && typeof instance.update === "function") {
            instance.update();
        } else if (typeof window !== "undefined") {
            if (typeof window.requestAnimationFrame === "function") {
                window.requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
            } else {
                window.dispatchEvent(new Event("resize"));
            }
        }
    }, []);

    useEffect(
        () => () => {
            popperInstanceRef.current = null;
        },
        []
    );

    const orderedItems = useMemo(() => {
        if (!rawItems || rawItems.length === 0) {
            return [];
        }
        // Return items directly, relying on datasource order
        return [...rawItems];
    }, [rawItems]);

    const handlePopper = useCallback(
        (popper, type) => {
            if (type === "tooltip") {
                popperInstanceRef.current = popper?.instance ?? null;
                requestReposition();
            }
            if (popper?.instance && typeof popper.instance.update === "function") {
                popper.instance.update();
            }
        },
        [requestReposition]
    );

    const popperFloaterProps = useMemo(() => ({ getPopper: handlePopper }), [handlePopper]);

    const joyrideSteps = useMemo(
        () =>
            orderedItems
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

                    return {
                        target: targetSelector,
                        disableBeacon: true,
                        content: createContentNode(widgetContent, requestReposition, stepKey),
                        floaterProps: popperFloaterProps,
                        className: TOOLTIP_CLASS,
                        data: { showProgress: props.showProgress }
                    };
                })
                .filter(step => step !== null),
        [orderedItems, stepTarget, stepWidget, requestReposition, popperFloaterProps, props.showProgress]
    );

    useEffect(() => {
        if (typeof document !== "undefined" && joyrideSteps.length > 0) {
            joyrideSteps.forEach(step => {
                if (step.target && !document.querySelector(step.target)) {
                    console.warn(`[OnboardingWidget] Target not found: "${step.target}"`);
                }
            });
        }
    }, [joyrideSteps]);

    const stepsReady = joyrideSteps.length > 0;

    const triggerValue =
        props.runTrigger && props.runTrigger.status === "available" ? props.runTrigger.value === true : undefined;

    const [tourState, dispatch] = useReducer(tourReducer, {
        run: false,
        pendingStart: false,
        autoStarted: false,
        hasReportedFinish: false,
        hasReportedExit: false,
        prevTrigger: false
    });

    const actionReportedRef = useRef({ finish: false, exit: false });

    useEffect(() => {
        console.log(`[OnboardingWidget] State update -> triggerStatus: ${props.runTrigger?.status}, triggerValue: ${triggerValue}, stepsReady: ${stepsReady}, tourState:`, tourState);
    }, [props.runTrigger?.status, triggerValue, stepsReady, tourState]);

    // Handle trigger-based tour start/stop
    useEffect(() => {
        console.log(`[OnboardingWidget] Evaluating trigger -> current: ${triggerValue}, prev: ${tourState.prevTrigger}`);
        if (triggerValue === undefined) {
            console.log(`[OnboardingWidget] Trigger is undefined. Waiting.`);
            return;
        }
        if (triggerValue && !tourState.prevTrigger) {
            console.log(`[OnboardingWidget] Trigger became true.`);
            actionReportedRef.current = { finish: false, exit: false }; // Reset ref for new tour run
            // Trigger changed from false to true - start tour
            if (stepsReady) {
                console.log(`[OnboardingWidget] Steps are ready, starting tour.`);
                dispatch({ type: TOUR_ACTIONS.START_TOUR });
            } else {
                console.log(`[OnboardingWidget] Steps NOT ready yet, setting pending start.`);
                dispatch({ type: TOUR_ACTIONS.SET_PENDING_START });
            }
        } else if (!triggerValue && tourState.prevTrigger) {
            console.log(`[OnboardingWidget] Trigger became false, stopping tour.`);
            // Trigger changed from true to false - stop tour
            dispatch({ type: TOUR_ACTIONS.STOP_TOUR });
            dispatch({ type: TOUR_ACTIONS.RESET_REPORTS });
        }

        dispatch({ type: TOUR_ACTIONS.UPDATE_PREV_TRIGGER, payload: triggerValue });
    }, [triggerValue, stepsReady, tourState.prevTrigger, tourState.run]);

    // Handle auto-start when no trigger is configured
    useEffect(() => {
        if (triggerValue === undefined) {
            if (stepsReady && !tourState.autoStarted) {
                console.log(`[OnboardingWidget] Auto-starting tour because no trigger value and steps are ready.`);
                dispatch({ type: TOUR_ACTIONS.MARK_AUTO_STARTED });
                dispatch({ type: TOUR_ACTIONS.START_TOUR });
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
            console.log(`[OnboardingWidget] Steps are now ready, starting pending tour.`);
            dispatch({ type: TOUR_ACTIONS.START_TOUR });
        }

        if (!stepsReady && tourState.run) {
            console.log(`[OnboardingWidget] Steps are no longer ready, stopping tour.`);
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
            back: BackButtonText,
            close: FinishButtonText,
            last: FinishButtonText,
            next: NextButtonText,
            skip: FinishButtonText
        }),
        [BackButtonText, NextButtonText, FinishButtonText]
    );

    const handleJoyride = useCallback(
        data => {
            if (!data) {
                return;
            }
            const { status, type, action } = data;

            const exitRequested = status === STATUS.SKIPPED || action === ACTIONS.CLOSE;
            const shouldStop = type === "tour:end" || status === STATUS.FINISHED || exitRequested;
            if (shouldStop) {
                console.log(`[OnboardingWidget] Joyride requested stop. type: ${type}, status: ${status}, action: ${action}`);
                dispatch({ type: TOUR_ACTIONS.STOP_TOUR });
            }
            if (status === STATUS.FINISHED && !actionReportedRef.current.finish) {
                actionReportedRef.current.finish = true; // Lock immediately
                console.log(`[OnboardingWidget] Tour finished, triggering onTourFinish action.`);
                dispatch({ type: TOUR_ACTIONS.REPORT_FINISH });
                tryExecuteAction(props.onTourFinish);
            }
            if (exitRequested && !actionReportedRef.current.exit && status !== STATUS.FINISHED) {
                actionReportedRef.current.exit = true; // Lock immediately
                console.log(`[OnboardingWidget] Tour exited early, triggering onTourExit action.`);
                dispatch({ type: TOUR_ACTIONS.REPORT_EXIT });
                tryExecuteAction(props.onTourExit);
            }
        },
        [props.onTourExit, props.onTourFinish, props.runTrigger, tourState.hasReportedFinish, tourState.hasReportedExit]
    );

    // Merge styles: default joyride options < user JSON override
    const defaultJoyrideStyles = useMemo(
        () => ({
            options: {
                primaryColor: primaryColor || "#2540AF",
                textColor: textColor || "#333333",
                zIndex: 10000
            }
        }),
        [primaryColor, textColor]
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

    const containerStyle = {
        ...props.style,
        "--ow-primary": primaryColor || "#2540AF",
        "--ow-bg": backgroundColor || "#ffffff",
        "--ow-text": textColor || "#333333",
        "--ow-radius": borderRadius != null ? `${borderRadius}px` : "8px"
    };

    const combinedClassName = classNames(WIDGET_CLASS, props.class);
    const showProgress = props.showProgress; // Now a string enum: "none" | "dots" | "fraction"
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
                <JoyrideComponent
                    run={true}
                    steps={joyrideSteps}
                    showProgress={showProgress === "fraction"} // Only native joyride progress if fraction
                    callback={handleJoyride}
                    styles={finalStyles}
                    locale={locale}
                    continuous
                    showSkipButton={false}
                    showBackButton={Boolean(BackButtonText)}
                    spotlightClicks={false}
                    disableOverlayClose={true}
                />
            )}
        </div>
    );
}

export default OnboardingWidget;
