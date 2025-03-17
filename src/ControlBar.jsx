// ControlBar.jsx

import { createEffect } from 'solid-js';

const ControlBar = props => {
    const {
        isTimePlaying,
        isTimePlayingReverse,
        timeAnimationSpeed,
        cycleTimeAnimationSpeed,
        startForwardTimeAnimation,
        startReverseTimeAnimation,
        moveForwardTimeFrame,
        moveBackwardTimeFrame,
        skipToLastTimeFrame,
        skipToFirstTimeFrame,
    } = props;

    createEffect(() => {
        const speedButton = document.getElementById('speed-button');
        if (speedButton) {
            speedButton.textContent = `${timeAnimationSpeed()}x`;
        }
    });

    createEffect(() => {
        const playForwardBtn = document.querySelector('#play-forward-btn');
        const playReverseBtn = document.querySelector('#play-reverse-btn');
        playForwardBtn.className = isTimePlaying() ? 'playing' : 'not-playing';
        playReverseBtn.className = isTimePlayingReverse() ? 'playing' : 'not-playing';
    });

    return (
        <code id="control-bar-container">
            <button onClick={skipToFirstTimeFrame}>|◀</button>
            <button onClick={moveBackwardTimeFrame}>◀◀</button>

            <button
                id="play-reverse-btn"
                class="play-btn"
                onClick={startReverseTimeAnimation}
            >
                {isTimePlayingReverse() ? '⏸' : `◀`}
            </button>
            <button
                id="play-forward-btn"
                class="play-btn"
                onClick={startForwardTimeAnimation}
            >
                {isTimePlaying() ? '⏸' : '▶'}
            </button>

            <button onClick={moveForwardTimeFrame}>▶▶</button>
            <button onClick={skipToLastTimeFrame}>▶|</button>

            <button id="speed-button" onClick={cycleTimeAnimationSpeed}>
                1x
            </button>
        </code>
    );
};

export default ControlBar;
