import Joyride from "react-joyride";
import { createElement } from "react";

const floaterProps = { disableAnimation: true };

export const JoyrideComponent = ({
    run,
    steps,
    stepIndex,
    showProgress,
    callback,
    styles,
    locale,
    continuous,
    showSkipButton,
    showBackButton
}) => (
    <Joyride
        run={run}
        steps={steps}
        stepIndex={stepIndex}
        showProgress={showProgress}
        callback={callback}
        disableBeacon
        floaterProps={floaterProps}
        styles={styles}
        locale={locale}
        continuous={continuous}
        showSkipButton={showSkipButton}
        showBackButton={showBackButton}
    />
);

