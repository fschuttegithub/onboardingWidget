import { createElement, useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import classNames from "classnames";
import { ACTIONS, STATUS } from "react-joyride";

import "./ui/OnboardingWidget.scss";
import { JoyrideComponent } from "./components/OnboardingWidgetComponent";

const WIDGET_CLASS = "onboarding-widget";
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

const createContentNode = (widgetContent, onResize) => createElement(ObservedStepContent, { onResize }, widgetContent);

const compareStepOrder = (orderAttribute, a, b) => {
    const aValue = getAttributeValue(orderAttribute, a);
    const bValue = getAttributeValue(orderAttribute, b);

    if (aValue == null && bValue == null) {
        return 0;
    }
    if (aValue == null) {
        return 1;
    }
    if (bValue == null) {
        return -1;
    }

    if (typeof aValue === "number" && typeof bValue === "number") {
        return aValue - bValue;
    }

    const aNumber = Number(aValue);
    const bNumber = Number(bValue);

    if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber)) {
        return aNumber - bNumber;
    }

    return `${aValue}`.localeCompare(`${bValue}`, undefined, { numeric: true, sensitivity: "base" });
};

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
    const { steps, stepTarget, stepOrder, stylesJson, BackButtonText, NextButtonText, FinishButtonText, stepWidget } =
        props;

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

        const list = [...rawItems];
        if (stepOrder && list.length > 1) {
            list.sort((a, b) => compareStepOrder(stepOrder, a, b));
        }

        return list;
    }, [rawItems, stepOrder]);

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
                .map(item => {
                    const targetSelector = formatSelector(getAttributeValue(stepTarget, item));
                    if (!targetSelector) {
                        return null;
                    }
                    
                    // Warn if target element doesn't exist in DOM
                    if (typeof document !== "undefined" && !document.querySelector(targetSelector)) {
                        console.warn(`[OnboardingWidget] Target not found: "${targetSelector}"`);
                    }
                    
                    const widgetContent = stepWidget?.get?.(item);
                    if (widgetContent === null || widgetContent === undefined) {
                        return null;
                    }

                    return {
                        target: targetSelector,
                        disableBeacon: true,
                        content: createContentNode(widgetContent, requestReposition),
                        floaterProps: popperFloaterProps
                    };
                })
                .filter(step => step !== null),
        [orderedItems, stepTarget, stepWidget, requestReposition, popperFloaterProps]
    );

    const stepsReady = joyrideSteps.length > 0;

    const triggerValue =
        props.runTrigger && props.runTrigger.status === "available" ? props.runTrigger.value === true : undefined;

    const [tourState, dispatch] = useReducer(tourReducer, {
        run: false,
        pendingStart: false,
        autoStarted: false,
        hasReportedFinish: false,
        hasReportedExit: false,
        prevTrigger: triggerValue ?? false
    });

    // Handle trigger-based tour start/stop
    useEffect(() => {
        if (triggerValue === undefined) {
            return;
        }
        if (triggerValue && !tourState.prevTrigger) {
            // Trigger changed from false to true - start tour
            if (stepsReady) {
                dispatch({ type: TOUR_ACTIONS.START_TOUR });
            } else {
                dispatch({ type: TOUR_ACTIONS.SET_PENDING_START });
            }
        } else if (!triggerValue && tourState.prevTrigger) {
            // Trigger changed from true to false - stop tour
            dispatch({ type: TOUR_ACTIONS.STOP_TOUR });
            dispatch({ type: TOUR_ACTIONS.RESET_REPORTS });
        } else if (triggerValue && tourState.prevTrigger && !tourState.run && stepsReady) {
            // Trigger remains true but tour was closed externally (overlay click) - restart tour
            dispatch({ type: TOUR_ACTIONS.START_TOUR });
        }

        dispatch({ type: TOUR_ACTIONS.UPDATE_PREV_TRIGGER, payload: triggerValue });
    }, [triggerValue, stepsReady, tourState.prevTrigger, tourState.run]);

    // Handle auto-start when no trigger is configured
    useEffect(() => {
        if (triggerValue === undefined) {
            if (stepsReady && !tourState.autoStarted) {
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
                dispatch({ type: TOUR_ACTIONS.STOP_TOUR });
                
                // Reset the run trigger attribute to false when tour stops
                if (props.runTrigger && typeof props.runTrigger.setValue === "function") {
                    props.runTrigger.setValue(false);
                }
            }
            if (status === STATUS.FINISHED && !tourState.hasReportedFinish) {
                dispatch({ type: TOUR_ACTIONS.REPORT_FINISH });
                if (!tryExecuteAction(props.onTourFinish)) {
                    tryExecuteAction(props.onTourExit);
                }
            }
            if (exitRequested && !tourState.hasReportedExit && status !== STATUS.FINISHED) {
                dispatch({ type: TOUR_ACTIONS.REPORT_EXIT });
                const executedExit = tryExecuteAction(props.onTourExit);
                if (!executedExit) {
                    tryExecuteAction(props.onTourFinish);
                }
            }
        },
        [props.onTourExit, props.onTourFinish, props.runTrigger, tourState.hasReportedFinish, tourState.hasReportedExit]
    );

    const combinedClassName = classNames(WIDGET_CLASS, props.class);
    const showProgress = props.showProgress ?? true;
    if (!joyrideSteps.length) {
        return <div className={combinedClassName} style={props.style} tabIndex={props.tabIndex} />;
    }

    return (
        <div className={combinedClassName} style={props.style} tabIndex={props.tabIndex}>
            {tourState.run && (
                <JoyrideComponent
                    run={true}
                    steps={joyrideSteps}
                    showProgress={showProgress}
                    callback={handleJoyride}
                    styles={stylesOverride}
                    locale={locale}
                    continuous
                    showSkipButton={false}
                    showBackButton={Boolean(BackButtonText)}
                />
            )}
        </div>
    );
}

export default OnboardingWidget;
