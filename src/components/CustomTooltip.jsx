import { createElement, useEffect, useRef } from "react";

// SVG Icons
const IconClose = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);

const IconArrowRight = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M9 18l6-6-6-6" />
    </svg>
);

const IconArrowLeft = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M15 18l-6-6 6-6" />
    </svg>
);

const IconCheck = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
);

export const CustomTooltip = ({
    index,
    size,
    step,
    backProps,
    closeProps,
    primaryProps,
    tooltipProps,
    isLastStep,
    locale,
    totalStepCount,
    stepOffset,
    progressMode
}) => {
    const { content, data } = step;
    const showProgress = data?.showProgress || "dots"; // Default to dots if undefined
    const advanceOnClick = data?.advanceOnClick ?? false;

    const resolvedTotal = totalStepCount != null ? totalStepCount : size;
    const resolvedOffset = stepOffset ?? 0;
    const isGloballyLastStep = totalStepCount != null ? resolvedOffset + index + 1 === resolvedTotal : isLastStep;

    const displayIndex = progressMode === "global" ? resolvedOffset + index : index;
    const displayTotal = progressMode === "global" ? resolvedTotal : size;

    const primaryTitle = isGloballyLastStep ? locale?.last || "Finish" : locale?.next || "Next";

    const dialogRef = useRef(null);
    useEffect(() => {
        if (dialogRef.current) {
            dialogRef.current.focus();
        }
    }, [index]);

    const handleKeyDown = e => {
        if (e.key === "Escape" && closeProps.onClick) {
            closeProps.onClick(e);
        }
    };

    return (
        <div
            className="onboarding-widget-tooltip custom-tooltip"
            {...tooltipProps}
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Tour step ${displayIndex + 1} of ${displayTotal}`}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
        >
            {/* Header with Close Button */}
            <button type="button" className="custom-tooltip__close" {...closeProps} aria-label="Close tour">
                <IconClose />
            </button>

            {/* Main Content Body */}
            <div className="custom-tooltip__body">{content}</div>

            {/* Footer with Navigation */}
            <div className="custom-tooltip__footer">
                {/* Back Button */}
                <div className="custom-tooltip__footer-left">
                    {index > 0 && !advanceOnClick && (
                        <button
                            type="button"
                            className="custom-tooltip__button custom-tooltip__button--back"
                            {...backProps}
                        >
                            <IconArrowLeft />
                            <span>{backProps.title || "Back"}</span>
                        </button>
                    )}
                </div>

                {/* Navigation Indicators (Dots or Text) */}
                <div className="custom-tooltip__dots" role="group" aria-label="Tour progress">
                    {showProgress === "dots" &&
                        Array.from({ length: displayTotal }).map((_, i) => (
                            <span
                                key={i}
                                className={`custom-tooltip__dot${
                                    i === displayIndex ? " custom-tooltip__dot--active" : ""
                                }`}
                                role="img"
                                aria-label={`Step ${i + 1} of ${displayTotal}`}
                                aria-current={i === displayIndex ? "step" : undefined}
                            />
                        ))}
                    {showProgress === "fraction" && (
                        <span className="custom-tooltip__fraction" aria-live="polite">
                            {displayIndex + 1} / {displayTotal}
                        </span>
                    )}
                </div>

                {/* Next / Finish Button */}
                <div className="custom-tooltip__footer-right">
                    {!advanceOnClick && (
                        <button
                            type="button"
                            className="custom-tooltip__button custom-tooltip__button--primary"
                            {...primaryProps}
                            title={primaryTitle} // Ensure the HTML title attribute is correct
                        >
                            <span>{primaryTitle}</span>
                            {isGloballyLastStep ? <IconCheck /> : <IconArrowRight />}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
