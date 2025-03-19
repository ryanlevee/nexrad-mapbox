const TypeSelect = props => {
    const {
        productType,
        productTypes,
        setProductType,
        pauseAllAnimations,
        setProductCode,
        productCode,
        L2CODE,
        allFilesData,
        setFilePrefix,
        setMaxTiltIndex,
        useDebounceTimeIndex,
        setTimeIndex,
        allPrefixesByCode,
        updateOverlay,
    } = props;

    const handleLevel2 = async () => {
        const allData = allFilesData();
        const currentProduct = productType();
        const currentProductData = allData[currentProduct];
        const productFilePrefixes = Object.keys(currentProductData);
        // console.log('productFilePrefixes:', productFilePrefixes);

        const latestPrefix =
            productFilePrefixes[productFilePrefixes.length - 1];

        setFilePrefix(latestPrefix);

        const currentFile = currentProductData[latestPrefix];

        // setMaxTiltIndex(
        //     allFilesData()[productType()][
        //         Object.keys(allFilesData()[productType()])[
        //             Object.keys(allFilesData()[productType()]).length - 1
        //         ]
        //     ].sweeps - 1
        // );
        // console.log('currentFile:', currentFile);

        setMaxTiltIndex(currentFile.sweeps - 1);

        await useDebounceTimeIndex(
            setTimeIndex(
                allPrefixesByCode()[productType()][productCode()].length - 1
            )
        );

        updateOverlay();
    };

    const handleChange = async event => {
        const value = event.target.value;
        if (productType() == value) return false;
        pauseAllAnimations();

        console.log('productCode():', productCode());

        setProductCode(value == 'reflectivity' ? L2CODE : null);
        setProductType(value);

        if (value == 'reflectivity') {
            handleLevel2();
        }
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
