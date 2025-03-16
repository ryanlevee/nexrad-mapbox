// ControlBar.jsx

import { createEffect } from 'solid-js';

const ControlBar = props => {
    const {
        isPlaying,
        isPlayingReverse,
        animationSpeed,
        cycleAnimationSpeed,
        startPlayAnimation,
        playReverseAnimation,
        moveForwardTimeFrame,
        moveBackwardTimeFrame,
        skipToLastTimeFrame,
        skipToFirstTimeFrame,
    } = props;

    createEffect(() => {
        const speedButton = document.getElementById('speed-button');
        if (speedButton) {
            speedButton.textContent = `${animationSpeed()}x`;
        }
    });

    createEffect(() => {
        const playForwardBtn = document.querySelector('#play-forward-btn');
        const playReverseBtn = document.querySelector('#play-reverse-btn');
        playForwardBtn.className = isPlaying() ? 'playing' : 'not-playing';
        playReverseBtn.className = isPlayingReverse() ? 'playing' : 'not-playing';
    });

    return (
        <code id="control-bar-container">
            <button onClick={skipToFirstTimeFrame}>|◀</button>
            <button onClick={moveBackwardTimeFrame}>◀◀</button>

            <button
                id="play-reverse-btn"
                class="play-btn"
                onClick={playReverseAnimation}
            >
                {isPlayingReverse() ? '⏸' : `◀`}
            </button>
            <button
                id="play-forward-btn"
                class="play-btn"
                onClick={startPlayAnimation}
            >
                {isPlaying() ? '⏸' : '▶'}
            </button>

            <button onClick={moveForwardTimeFrame}>▶▶</button>
            <button onClick={skipToLastTimeFrame}>▶|</button>

            <button id="speed-button" onClick={cycleAnimationSpeed}>
                1x
            </button>
        </code>
    );
};

export default ControlBar;
