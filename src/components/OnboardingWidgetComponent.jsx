import Joyride from "react-joyride";
import { createElement } from "react";

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
    disableOverlayClose
}) => (
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
        spotlightClicks={spotlightClicks}
        disableOverlayClose={disableOverlayClose}
    />
);

