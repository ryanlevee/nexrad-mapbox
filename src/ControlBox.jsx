const ControlBox = props => {
    const {
        tiltIndex,
        setTiltIndex,
        maxTiltIndex,
        pauseAllAnimations,
        overlayData,
        useDebounceTiltIndex,
        updateOverlay,
        isTiltPlaying,
        startTiltAnimation,
    } = props;

    const handleClick = async e => {
        pauseAllAnimations();

        const nextTiltIndex = tiltIndex() + parseInt(e.target.value);

        if (nextTiltIndex > maxTiltIndex()) {
            await useDebounceTiltIndex(setTiltIndex(0));
        } else if (nextTiltIndex < 0) {
            await useDebounceTiltIndex(setTiltIndex(maxTiltIndex()));
        } else {
            await useDebounceTiltIndex(setTiltIndex(nextTiltIndex));
        }

        updateOverlay();
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
                <button
                    id="play-tilt-forward-btn"
                    class="play-tilt-btn"
                    onClick={startTiltAnimation}
                >
                    {isTiltPlaying() ? '⏸' : '▶'}
                </button>
            </div>
            <div>
                <div id="tilt-degrees-display-container">
                    <div id="tilt-degrees-display">
                        {parseFloat(
                            overlayData().elevation_angle_degrees
                        ).toFixed(4)}
                        °
                    </div>
                </div>
            </div>
        </code>
    );
};

export default ControlBox;
