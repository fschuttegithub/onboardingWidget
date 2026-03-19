import Joyride from "react-joyride";
import { createElement, useCallback } from "react";

import { CustomTooltip } from "./CustomTooltip";

const floaterProps = { disableAnimation: true };

export const JoyrideComponent = ({
    run,
    steps,
    showProgress,
    callback,
    styles,
    locale,
    continuous,
    showSkipButton,
    showBackButton,
    spotlightClicks,
    disableOverlayClose,
    stepIndex,
    getHelpers,
    totalStepCount,
    stepOffset,
    progressMode
}) => {
    const TooltipComponent = useCallback(
        joyrideProps => (
            <CustomTooltip
                {...joyrideProps}
                locale={locale}
                totalStepCount={totalStepCount}
                stepOffset={stepOffset}
                progressMode={progressMode}
            />
        ),
        [locale, totalStepCount, stepOffset, progressMode]
    );

    return (
        <Joyride
            run={run}
            steps={steps}
            showProgress={showProgress}
            callback={callback}
            disableBeacon
            floaterProps={floaterProps}
            styles={styles}
            locale={locale}
            continuous={continuous}
            showSkipButton={showSkipButton}
            showBackButton={showBackButton}
            stepIndex={stepIndex}
            spotlightClicks={spotlightClicks}
            disableOverlayClose={disableOverlayClose}
            getHelpers={getHelpers}
            tooltipComponent={TooltipComponent}
        />
    );
};
