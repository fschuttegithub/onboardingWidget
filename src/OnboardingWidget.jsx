import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

    const prevTriggerRef = useRef(triggerValue ?? false);
    const pendingStartRef = useRef(false);
    const autoStartRef = useRef(false);
    const hasReportedFinishRef = useRef(false);
    const hasReportedExitRef = useRef(false);

    const [run, setRun] = useState(false);

    useEffect(() => {
        if (triggerValue === undefined) {
            return;
        }
        if (triggerValue && !prevTriggerRef.current) {
            if (stepsReady) {
                setRun(true);
                hasReportedExitRef.current = false;
                hasReportedFinishRef.current = false;
            } else {
                pendingStartRef.current = true;
            }
        } else if (!triggerValue && prevTriggerRef.current) {
            setRun(false);
            pendingStartRef.current = false;
            hasReportedExitRef.current = false;
            hasReportedFinishRef.current = false;
        }

        prevTriggerRef.current = triggerValue;
    }, [triggerValue, stepsReady]);

    useEffect(() => {
        if (triggerValue === undefined) {
            if (stepsReady && !autoStartRef.current) {
                autoStartRef.current = true;
                setRun(true);
                hasReportedExitRef.current = false;
                hasReportedFinishRef.current = false;
            } else if (!stepsReady) {
                autoStartRef.current = false;
            }
        } else {
            autoStartRef.current = false;
        }
    }, [triggerValue, stepsReady]);

    useEffect(() => {
        if (stepsReady && pendingStartRef.current) {
            pendingStartRef.current = false;
            setRun(true);
            hasReportedExitRef.current = false;
            hasReportedFinishRef.current = false;
        }

        if (!stepsReady) {
            setRun(false);
            pendingStartRef.current = false;
        }
    }, [stepsReady]);

    useEffect(() => {
        if (run) {
            hasReportedExitRef.current = false;
            hasReportedFinishRef.current = false;
        }
    }, [run]);

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
    }, [stylesJson?.status, stylesJson?.value]);

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
                setRun(false);
                pendingStartRef.current = false;
            }
            if (status === STATUS.FINISHED && !hasReportedFinishRef.current) {
                hasReportedFinishRef.current = true;
                if (!tryExecuteAction(props.onTourFinish)) {
                    tryExecuteAction(props.onTourExit);
                }
            }
            if (exitRequested && !hasReportedExitRef.current && status !== STATUS.FINISHED) {
                hasReportedExitRef.current = true;
                const executedExit = tryExecuteAction(props.onTourExit);
                if (!executedExit) {
                    tryExecuteAction(props.onTourFinish);
                }
            }
        },
        [props.onTourExit, props.onTourFinish]
    );

    const combinedClassName = classNames(WIDGET_CLASS, props.class);
    const showProgress = props.showProgress ?? true;
    if (!joyrideSteps.length) {
        return <div className={combinedClassName} style={props.style} tabIndex={props.tabIndex} />;
    }

    return (
        <div className={combinedClassName} style={props.style} tabIndex={props.tabIndex}>
            <JoyrideComponent
                run={run}
                steps={joyrideSteps}
                showProgress={showProgress}
                callback={handleJoyride}
                styles={stylesOverride}
                locale={locale}
                continuous
                showSkipButton={false}
                showBackButton={Boolean(BackButtonText)}
            />
        </div>
    );
}

export default OnboardingWidget;
