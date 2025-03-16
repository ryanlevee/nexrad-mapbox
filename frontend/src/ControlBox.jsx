// import { createEffect } from 'solid-js';

const ControlBox = props => {
    const {
        tiltIndex,
        setTiltIndex,
        debouncedUpdateOverlay,
        maxTiltIndex,
        pauseBothAnimations,
        overlayData
    } = props;

    const handleClick = e => {
        pauseBothAnimations()

        const nextTiltIndex = tiltIndex() + parseInt(e.target.value);

        if (nextTiltIndex > maxTiltIndex()) {
            setTiltIndex(0);
        } else if (nextTiltIndex < 0) {
            setTiltIndex(maxTiltIndex());
        } else {
            setTiltIndex(nextTiltIndex);
        }

        debouncedUpdateOverlay('debouncedUpdateOverlay() ControlBox.jsx handleClick()');
    };

    return (
        <code id="control-tilt-container">
            <div>
            <button
                id="tilt-up-btn"
                class="tilt-btn"
                value="1"
                onClick={handleClick}
            >
                ▲
            </button>
            <button
                id="tilt-down-btn"
                class="tilt-btn"
                value="-1"
                onClick={handleClick}
            >
                ▼
            </button>
            </div>
            <div>
            <div id="tilt-degrees-display-container">
                <div id="tilt-degrees-display">
                {parseFloat(overlayData().elevation_angle_degrees).toFixed(4)}°
                </div>
            </div>
            </div>
        </code>
    );
};

export default ControlBox;
