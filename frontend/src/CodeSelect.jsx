const CodeSelect = props => {
    const {
        codeOptions,
        productCode,
        setProductCode,
        pauseBothAnimations,
        productType,
    } = props;

    const handleChange = event => {
        pauseBothAnimations();
        if (event.target.value.count != 0)
            setProductCode(event.target.value.value);
    };

    return (
        <div id="code-select-container" class="dropup">
            <button id="code-select" class="dropbtn">
                <div id="code-select-inner-div">
                    <div>
                        {productCode()
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
                    const opacity = option.count == 0 ? 0.5 : 1;
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
