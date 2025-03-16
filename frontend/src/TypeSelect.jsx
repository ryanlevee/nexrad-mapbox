// TypeSelect.jsx

const TypeSelect = props => {
    const { productType, productTypes, setProductType, pauseBothAnimations, setProductCode } =
        props;

    // const options = [
    //     { value: 'reflectivity', label: 'reflectivity', level: '2' },
    //     { value: 'hydrometeor', label: 'hydrometeor', level: '3' },
    //     { value: 'precipitation', label: 'precipitation', level: '3' },
    // ];

    const handleChange = async event => {
        const level = event.target.value;
        if (productType() == level) return false;
        setProductCode(null);
        setProductType(level);
        pauseBothAnimations();
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
                    <div class="dropup-option" onClick={handleChange} value={type.value}>
                        {type.label}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TypeSelect;
