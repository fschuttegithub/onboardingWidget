import { createElement } from "react";
import classNames from "classnames";

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
                <span aria-hidden="true">&times;</span>
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
                            {backProps.title || "Back"}
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
                        {primaryTitle}
                    </button>
                </div>
            </div>
        </div>
    );
};
