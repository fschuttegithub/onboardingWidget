import { createElement } from "react";
import classNames from "classnames";

// SVG Icons
const IconClose = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);

const IconArrowRight = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18l6-6-6-6" />
    </svg>
);

const IconArrowLeft = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
    </svg>
);

const IconCheck = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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
    isLastStep
}) => {
    const { content, data } = step;
    const showProgress = data?.showProgress || "dots"; // Default to dots if undefined

    // Override title for primary button to avoid "Next (Step 1 of 3)"
    const primaryTitle = isLastStep ? "Finish" : "Next";

    return (
        <div className="onboarding-widget-tooltip custom-tooltip" {...tooltipProps}>
            {/* Header with Close Button */}
            <button
                type="button"
                className="custom-tooltip__close"
                {...closeProps}
                aria-label="Close"
            >
                <IconClose />
            </button>

            {/* Main Content Body */}
            <div className="custom-tooltip__body">{content}</div>

            {/* Footer with Navigation */}
            <div className="custom-tooltip__footer">
                {/* Back Button */}
                <div className="custom-tooltip__footer-left">
                    {index > 0 && (
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
                <div className="custom-tooltip__dots">
                    {showProgress === "dots" &&
                        Array.from({ length: size }).map((_, i) => (
                            <span
                                key={i}
                                className={classNames("custom-tooltip__dot", {
                                    "custom-tooltip__dot--active": i === index
                                })}
                            />
                        ))}
                    {showProgress === "fraction" && (
                        <span className="custom-tooltip__fraction">
                            {index + 1} / {size}
                        </span>
                    )}
                </div>

                {/* Next / Finish Button */}
                <div className="custom-tooltip__footer-right">
                    <button
                        type="button"
                        className="custom-tooltip__button custom-tooltip__button--primary"
                        {...primaryProps}
                        title={primaryTitle} // Ensure the HTML title attribute is correct
                    >
                        <span>{primaryTitle}</span>
                        {isLastStep ? <IconCheck /> : <IconArrowRight />}
                    </button>
                </div>
            </div>
        </div>
    );
};
