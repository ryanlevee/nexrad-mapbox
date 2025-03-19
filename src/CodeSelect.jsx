const CodeSelect = props => {
    const {
        codeOptions,
        productCode,
        setProductCode,
        pauseAllAnimations,
        productType,
        L2CODE,
        useDebounceTimeIndex,
        setTimeIndex,
        allPrefixesByCode,
        isOverlayLoaded,
        setupOverlay,
        cachedProducts,
        handleCacheImages,
    } = props;

    const handleChange = async event => {
        pauseAllAnimations();

        if (productCode() == event.target.value.value) return false;

        if (event.target.value.count != 0) {
            setProductCode(event.target.value.value);

            if (!cachedProducts[productType()][productCode()]) {
                await handleCacheImages();
            }

            useDebounceTimeIndex(
                setTimeIndex(
                    allPrefixesByCode()[productType()][productCode()].length - 1
                )
            );

            if (isOverlayLoaded()) {
                setupOverlay();
            }
        }
    };

    return (
        <div id="code-select-container" class="dropup">
            <button id="code-select" class="dropbtn">
                <div id="code-select-inner-div">
                    <div>
                        {productCode() && productCode() != L2CODE
                            ? codeOptions().find(
                                  opt => opt.value == productCode()
                              ).label
                            : `Please select ${productType()} type...`}
                    </div>
                    <div>△</div>
                </div>
            </button>
            <div class="dropup-content">
                {codeOptions().map(option => {
                    const opacity = !option.count ? 0.5 : 1;
                    return (
                        <div style={{ opacity: opacity }}>
                            <div
                                class="dropup-option"
                                onClick={handleChange}
                                value={option}
                            >
                                {option.label}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CodeSelect;
