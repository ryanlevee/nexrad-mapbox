const TypeSelect = props => {
    const {
        productType,
        productTypes,
        setProductType,
        pauseAllAnimations,
        setProductCode,
        productCode,
        L2CODE
    } = props;

    const handleChange = async event => {
        const value = event.target.value;
        if (productType() == value) return false;
        pauseAllAnimations();

        console.log('productCode():', productCode())

        setProductCode(value == 'reflectivity' ? L2CODE : null);
        setProductType(value);
    };

    return (
        <div id="type-select-container" class="dropup">
            <button id="type-select" class="dropbtn">
                <div id="type-select-inner-div">
                    <div>{productType()}</div>
                    <div>△</div>
                </div>
            </button>
            <div class="dropup-content">
                {productTypes.map(type => (
                    <div
                        class="dropup-option"
                        onClick={handleChange}
                        value={type.value}
                    >
                        {type.label}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TypeSelect;
