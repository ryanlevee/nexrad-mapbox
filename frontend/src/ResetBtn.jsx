// ResetButton.jsx

const ResetButton = props => {
    const { map, mapOrigin } = props;

    const options = {
        center: mapOrigin,
        pitch: 0,
        zoom: 7.8,
        bearing: 0,
    };

    const handleClick =  () => {
        map.flyTo(options)
    };

    return (
            <div id="reset-btn" onclick={handleClick}>
                <div class="x-mark"></div>
                <div class="reset-dot"></div>
                {/* <span>⊕</span> */}
                {/* <div class="vertical-line"></div> */}
                {/* <div class="horizontal-line"></div> */}
            </div>
    );
};

export default ResetButton;
