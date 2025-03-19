import {
    onMount,
    createSignal,
    createEffect,
    onCleanup,
    createRenderEffect,
} from 'solid-js';
import ControlBox from './ControlBox';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import ControlBar from './ControlBar';
import MouseLatLng from './MouseLatLng';
import CodeSelect from './CodeSelect';
import TypeSelect from './TypeSelect';
import ResetBtn from './ResetBtn';
import UpdateAlert from './UpdateAlert';

const App = () => {
    const basePath = '.';
    const plotsPathPrefix = `${basePath}/plots_level`;
    const imgExt = 'png';
    const mapOrigin = [-118.8529281616211, 45.690650939941406];

    const productTypes = [
        { value: 'reflectivity', label: 'reflectivity', level: '2' },
        { value: 'hydrometeor', label: 'hydrometeor', level: '3' },
        { value: 'precipitation', label: 'precipitation', level: '3' },
    ];

    const cachedProducts = (() =>
        productTypes.reduce(
            (acc, type) => ((acc[type.value] = {}), acc),
            {}
        ))();

    const mapRef = { current: null };
    const jsonDataCache = {};
    const imageCache = {};
    const intervalMs = 500;
    const L2CODE = 'V06';

    const [isOverlayLoaded, setIsOverlayLoaded] = createSignal(false);
    const [isCaching, setIsCaching] = createSignal(false);

    const [cacheCount, setCacheCount] = createSignal(0);
    const [cacheTotal, setCacheTotal] = createSignal(0);

    const [level, setLevel] = createSignal('2');
    const [plotsPath, setPlotsPath] = createSignal(
        `${plotsPathPrefix}${level()}`
    );

    const [productType, setProductType] = createSignal('reflectivity');
    const [productCode, setProductCode] = createSignal(L2CODE);
    const [codeOptions, setCodeOptions] = createSignal(null);
    const [allProductCodes, setAllProductCodes] = createSignal(null);

    const [filePrefix, setFilePrefix] = createSignal('');
    // const [activePrefixes, setActivePrefixes] = createSignal(null);
    const [allPrefixesByCode, setAllPrefixesByCode] = createSignal({});

    const [overlayData, setOverlayData] = createSignal({});
    const [allFilesData, setAllFilesData] = createSignal({});

    const [tiltIndex, setTiltIndex] = createSignal(0);
    const [timeIndex, setTimeIndex] = createSignal(null);
    const [maxTiltIndex, setMaxTiltIndex] = createSignal(null);

    const [moveEvent, setMoveEvent] = createSignal(null);
    const [loadingBar, setLoadingBar] = createSignal([]);

    const [isTiltPlaying, setIsTiltPlaying] = createSignal(false);
    const [isTimePlaying, setIsTimePlaying] = createSignal(false);
    const [isTimePlayingReverse, setIsTimePlayingReverse] = createSignal(false);
    const [timeAnimationSpeed, setTimeAnimationSpeed] = createSignal(1);
    const animationSpeeds = [0.5, 1, 1.5, 2, 2.5, 3];
    let tiltAnimationInterval;
    let forwardAnimationInterval;
    let reverseAnimationInterval;

    function truthy(item) {
        if (!item) return false;
        else if (Array.isArray(item)) return item.some(truthy);
        else if (typeof item == 'object')
            return Object.values(item).some(truthy);
        return true;
    }

    function useDebounce(signalSetter, delay) {
        let timerHandle;

        const debouncedSignalSetter = x =>
            new Promise(resolve => {
                clearTimeout(timerHandle);
                timerHandle = setTimeout(() => resolve(signalSetter(x)), delay);
            });
        onCleanup(() => clearInterval(timerHandle));
        return debouncedSignalSetter;
    }

    const useDebounceTiltIndex = useDebounce(tiltIndex, 25);
    const useDebounceTiltAnimation = useDebounce(tiltIndex, 15);
    const useDebounceTimeIndex = useDebounce(timeIndex, 25);
    const useDebounceTimeAnimation = useDebounce(timeIndex, 7);

    const setupOverlay = () => {
        console.log('running setupOverlay()');
        const currentProductPrefixes =
            allPrefixesByCode()[productType()][productCode()];

        const newFilePrefix = currentProductPrefixes[timeIndex()];

        setFilePrefix(newFilePrefix);

        const currentFilesData = allFilesData()[productType()];

        console.log('currentFilesData:', currentFilesData);
        console.log('newFilePrefix:', newFilePrefix);

        const newFileData = currentFilesData[newFilePrefix];
        const newMaxTiltIndex = newFileData.sweeps - 1;

        if (tiltIndex() > newMaxTiltIndex) {
            setTiltIndex(newMaxTiltIndex);
        }

        setMaxTiltIndex(newMaxTiltIndex);
        updateOverlay(origin);
    };

    const cycleTimeAnimationSpeed = (_, speed = 0) => {
        const wasPlaying = isTimePlaying();
        const wasPlayingReverse = isTimePlayingReverse();

        if (wasPlaying) {
            pauseForwardTimeAnimation();
        } else if (wasPlayingReverse) {
            pauseReverseTimeAnimation();
        }

        if (speed) {
            setTimeAnimationSpeed(speed);
        } else {
            setTimeAnimationSpeed(currentSpeed => {
                const currentIndex = animationSpeeds.indexOf(currentSpeed);
                const nextIndex = (currentIndex + 1) % animationSpeeds.length;
                return animationSpeeds[nextIndex];
            });
        }

        requestAnimationFrame(() => {
            if (wasPlaying) {
                startForwardTimeAnimation();
            } else if (wasPlayingReverse) {
                startReverseTimeAnimation();
            }
        });
    };

    const ensureProduct = () => {
        if (
            (level() == '2' &&
                productType() == 'reflectivity' &&
                productCode() == L2CODE) ||
            (level() == '3' &&
                productCode() &&
                productCode() != L2CODE &&
                tiltIndex() == 0)
        ) {
            return true;
        }
        return false;
    };

    const startForwardTimeAnimation = () => {
        // console.log('playing');
        if (!ensureProduct()) return false;
        if (!forwardAnimationInterval) {
            setIsTimePlaying(true);
            setIsTimePlayingReverse(false);
            pauseReverseTimeAnimation();
            pauseTiltAnimation();
            forwardAnimationInterval = setInterval(async () => {
                await useDebounceTimeAnimation(
                    setTimeIndex(prevIndex => {
                        const nextIndex = prevIndex + 1;
                        return nextIndex >=
                            allPrefixesByCode()[productType()][productCode()]
                                .length
                            ? 0
                            : nextIndex;
                    })
                );
                setupOverlay();
            }, intervalMs / timeAnimationSpeed());
        } else {
            pauseForwardTimeAnimation();
        }
    };

    const startReverseTimeAnimation = () => {
        // console.log('reverse playing');
        if (!ensureProduct()) return false;
        if (!reverseAnimationInterval) {
            setIsTimePlayingReverse(true);
            setIsTimePlaying(false);
            pauseForwardTimeAnimation();
            pauseTiltAnimation();
            reverseAnimationInterval = setInterval(async () => {
                await useDebounceTimeAnimation(
                    setTimeIndex(prevIndex => {
                        const nextIndex = prevIndex - 1;
                        return nextIndex < 0
                            ? allPrefixesByCode()[productType()][productCode()]
                                  .length - 1
                            : nextIndex;
                    })
                );
                setupOverlay();
            }, intervalMs / timeAnimationSpeed());
        } else {
            pauseReverseTimeAnimation();
        }
    };

    const startTiltAnimation = () => {
        // console.log('tiltAnimationInterval:', tiltAnimationInterval);

        if (!tiltAnimationInterval) {
            pauseAllAnimations();
            setIsTiltPlaying(true);

            tiltAnimationInterval = setInterval(async () => {
                await useDebounceTiltAnimation(
                    setTiltIndex(prevIndex => {
                        const nextIndex = prevIndex + 1;
                        return nextIndex > maxTiltIndex() ? 0 : nextIndex;
                    })
                );
                updateOverlay();
            }, 350);
        } else {
            pauseTiltAnimation();
        }
    };

    const pauseTiltAnimation = () => {
        setIsTiltPlaying(false);
        clearInterval(tiltAnimationInterval);
        tiltAnimationInterval = null;
    };

    const pauseForwardTimeAnimation = () => {
        setIsTimePlaying(false);
        clearInterval(forwardAnimationInterval);
        forwardAnimationInterval = null;
    };

    const pauseReverseTimeAnimation = () => {
        setIsTimePlayingReverse(false);
        clearInterval(reverseAnimationInterval);
        reverseAnimationInterval = null;
    };

    const pauseAllAnimations = () => {
        pauseForwardTimeAnimation();
        pauseReverseTimeAnimation();
        pauseTiltAnimation();
    };

    const moveForwardTimeFrame = async () => {
        if (!ensureProduct()) return false;
        pauseAllAnimations();
        if (
            timeIndex() ==
            allPrefixesByCode()[productType()][productCode()].length - 1
        ) {
            skipToFirstTimeFrame();
        } else {
            await useDebounceTimeAnimation(
                setTimeIndex(prevIndex =>
                    Math.min(
                        prevIndex + 1,
                        allPrefixesByCode()[productType()][productCode()]
                            .length - 1
                    )
                )
            );
            setupOverlay();
        }
    };

    const moveBackwardTimeFrame = async () => {
        if (!ensureProduct()) return false;
        pauseAllAnimations();
        if (timeIndex() == 0) {
            skipToLastTimeFrame();
        } else {
            await useDebounceTimeAnimation(
                setTimeIndex(prevIndex => Math.max(prevIndex - 1, 0))
            );
            setupOverlay();
        }
    };

    const skipToLastTimeFrame = async () => {
        if (!ensureProduct()) return false;
        pauseAllAnimations();
        setTimeIndex(
            allPrefixesByCode()[productType()][productCode()].length - 1
        );
        setupOverlay();
    };

    const skipToFirstTimeFrame = async () => {
        if (!ensureProduct()) return false;
        pauseAllAnimations();
        await useDebounceTimeAnimation(setTimeIndex(0));
        setupOverlay();
    };

    // const apiEndpoint = 'https://abcdef123.execute-api.us-east-1.amazonaws.com/prod/check-updates'; // example
    // const apiEndpoint = `${listsPath}/updated_data.json`;
    const apiEndpointTest = 'https://nexrad-mapbox-backend.onrender.com';
    // const apiEndpointTest = 'http://localhost:4000';

    const getAllListData = async () => {
        const response = await fetch(`${apiEndpointTest}/list-all/`, {
            method: 'GET',
            headers: {
                'ngrok-skip-browser-warning': 'true', // Or try '69420'
                // 'Content-Type': 'application/json', // Add this back if your API expects JSON
            },
        });
        // console.log(response)
        const allListData = await response.json();
        if (!truthy(allListData)) return false; // needs to throw error
        return allListData;
    };
    
    const generateAllPrefixesByCode = allListData => {
        let processedListData = {};
        let prefixesByCode = {};

        const productTypeNames = productTypes.map(p => p.value);

        productTypeNames.forEach(product => {
            const productListData = allListData[product];

            processedListData[product] = productListData;

            prefixesByCode[product] = Object.keys(productListData).reduce(
                (acc, key) => {
                    const prefix = key.replace('.png', '');

                    if (product == 'reflectivity') {
                        if (!acc[L2CODE]) acc[L2CODE] = [];
                        acc[L2CODE].push(prefix);
                    } else {
                        const nameParts = prefix.split('_');
                        const code = nameParts[nameParts.length - 1];
                        if (!acc[code]) acc[code] = [];
                        acc[code].push(prefix);
                    }

                    return acc;
                },
                []
            );
        });

        setAllFilesData(processedListData);
        setAllPrefixesByCode(prefixesByCode);
        return prefixesByCode;
    };

    const generateProductCodes = async () => {
        const response = await fetch(`${apiEndpointTest}/code/`, {
            method: 'GET',
        });

        const codes = await response.json();
        setAllProductCodes(codes);
    };

    onCleanup(() => {
        if (mapRef.current) {
            mapRef.current.remove();
        }
        pauseAllAnimations();
        Object.keys(imageCache).forEach(key => delete imageCache[key]);
        Object.keys(jsonDataCache).forEach(key => delete jsonDataCache[key]);
    });

    const [isUpToDate, setIsUpToDate] = createSignal(false);

    const cacheUpdatedImages = updates => {
        Object.entries(updates).forEach(([key, value]) => {
            if (value) {
                // console.log(allFilesData()[productType()]);
            }
        });
    };

    ////////////////// API TESTING //////////////////

    const handleUpdates = async product => {
        console.log('updating lists...');

        const response = await fetch(
            `${apiEndpointTest}/list/${level()}/${product}/`,
            {
                method: 'GET',
            }
        );

        let updatedList = await response.json();

        if (typeof updatedList === 'string') {
            try {
                updatedList = JSON.parse(updatedList);
            } catch (parseError) {
                console.error('Error parsing JSON string:', parseError);
                return;
            }
        }

        Object.entries(updatedList).forEach(([key, value]) => {
            const code = key.slice(key.length - 3);
            allPrefixesByCode()[product][code] = key;
        });

        allFilesData()[product] = updatedList;
        // setActivePrefixes(Object.keys(updatedList));
        const consistentIndex = Object.keys(updatedList).indexOf(filePrefix());
        setTimeIndex(consistentIndex);
        // if (!isCaching()) handleCacheImages()

        console.log('allPrefixesByCode()', allPrefixesByCode());
        console.log('allFilesData()', allFilesData());
        // console.log('activePrefixes()', activePrefixes());

        return true;
    };

    const getAllListDataInBackground = () => {
        fetch(`${apiEndpointTest}/list-all/`, {
            method: 'GET',
        })
            .then(response => response.json())
            .then(data => {
                generateAllPrefixesByCode(data);
            });
    };

    const checkUpdates = async () => {
        console.log('Checking for updates...');

        // const consistentIndex = Object.keys(
        //     allFilesData()[productType()]
        // ).indexOf(filePrefix());

        getAllListDataInBackground();
        generateProductCodes();
        bulkCacheImages();

        // console.log('newListData:', newListData)

        // console.log(prefixesByCode)

        // const response = await fetch(`${apiEndpointTest}/flag/`, {
        //     method: 'GET',
        // });

        // let data = await response.json();

        // if (typeof data === 'string') {
        //     try {
        //         data = JSON.parse(data);
        //     } catch (parseError) {
        //         console.error('Error parsing JSON string:', parseError);
        //         return;
        //     }
        // }

        // let updateComplete = false;
        // console.log(data);

        // const updatedProduct = Object.entries(data.updates)
        //     .map(([key, value]) => (value ? key : false))
        //     .filter(Boolean);

        // if (updatedProduct.length) {
        //     updatedProduct.forEach(product => {
        //         setIsUpToDate(false);
        //         updateComplete = handleUpdates(product);
        //         data.updates[product] = 0;
        //     });
        // } else {
        //     console.log('No updates');
        // }

        // if (!updateComplete) {
        //     setIsUpToDate(true);
        //     return false;
        // }

        // //// mimic sending POST request to API:

        // try {
        //     const r = await fetch(`${apiEndpointTest}/flag/`, {
        //         method: 'POST',
        //         headers: {
        //             'Content-Type': 'application/json',
        //         },
        //         body: JSON.stringify(data),
        //     });

        //     const responseBody = await r.json();
        //     console.log(responseBody);
        //     setIsUpToDate(true);
        // } catch (error) {
        //     console.error('Error checking updates:', error);
        // }
    };

    const preloadImage = imageKey => {
        // console.log('preloading image...');
        const apiRoute = `${apiEndpointTest}/data/${level()}/${imageKey}/${imgExt}`;

        return new Promise((resolve, reject) => {
            fetch(apiRoute)
                .then(response => response.blob())
                .then(blob => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        resolve(reader.result);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                })
                .catch(reject);
        });
    };

    const cacheImage = async (imageKey, i) => {
        return new Promise((resolve, reject) => {
            const apiRoute = `${apiEndpointTest}/data/${level()}/${imageKey}/${imgExt}`;

            fetch(apiRoute, {
                method: 'GET',
                // headers: {
                //     'Content-Type': 'image/png',
                // },
            })
                .then(response => response.blob())
                .then(blob => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        imageCache[imageKey] = reader.result;
                        setCacheCount(i);
                        // console.log(cacheCount())
                        // console.log(i)
                        resolve(true); // Resolve the Promise when the image is loaded and cached
                    };
                    reader.onerror = error => {
                        console.error(
                            `Error reading blob for ${imageKey}:`,
                            error
                        );
                        reject(error); // Reject the Promise if there's an error
                    };
                    reader.readAsDataURL(blob);
                })
                .catch(error => {
                    console.error(`Error fetching image ${imageKey}:`, error);
                    reject(error); // Reject the Promise if the fetch fails
                });
        });
    };

    const bulkCacheImages = async () => {
        setCacheCount(0);
        let imageTotal = 0;
        const currentProductType = productType();
        const currentProductCode = productCode();
        const currentFilesData = allFilesData()[currentProductType];
        console.log(
            `Caching ${currentProductType}:${currentProductCode} images...`
        );

        const prefixes = allPrefixesByCode()[currentProductType][productCode()];
        const imagePromises = [];

        // console.log('prefixes:', prefixes);

        let i = 0;
        prefixes.forEach(prefix => {
            const maxIdx = currentFilesData[prefix].sweeps - 1;

            for (let iTilt = 0; iTilt <= maxIdx; iTilt++) {
                const imageKey = `${prefix}_${currentProductType}_idx${iTilt}`;
                if (!imageCache[imageKey]) {
                    imagePromises.push(cacheImage(imageKey, i++));
                    setLoadingBar([...loadingBar(), imageTotal]);
                }
                setCacheTotal(imageTotal++);
            }
        });

        cachedProducts[currentProductType][currentProductCode] = true;

        await Promise.all(imagePromises);

        console.log(
            `All ${currentProductType}:${currentProductCode} images cached.`
        );
    };

    const handleCacheImages = async () => {
        // clearInterval(updateInterval);
        setIsCaching(true);
        await bulkCacheImages();
        setIsCaching(false);
        // if (!updateInterval) updateInterval = setInterval(checkUpdates, 10000); // 2 minutes = 120000
    };

    const getJson = async (fileKey, addToMap = true) => {
        const apiRoute = `${apiEndpointTest}/data/${level()}/${fileKey}/json`;
        return fetch(apiRoute, {
            method: 'GET',
        })
            .then(response => response.json())
            .then(data => {
                setOverlayData(data);
                jsonDataCache[fileKey] = data;

                if (!addToMap) return true;

                if (data) {
                    mapRef.current
                        .getSource('radar')
                        .setCoordinates(getCoordinates(data));
                } else {
                    console.error(
                        `Invalid image coordinates in ${fileKey}.json`
                    );
                }
            });
    };

    // const bulkCacheJson = () => {
    //     console.log('Caching all json...');

    //     productTypes.forEach(product => {
    //         const type = product.value;
    //         const lvl = product.level;
    //         const prefixes = allFilesData()[type];

    //         Object.entries(prefixes).forEach(([key, value]) => {
    //             const sweeps = value.sweeps - 1;

    //             for (let i = 0; i <= sweeps; i++) {
    //                 const fileKey = `${key}_${type}_idx${i}`;
    //                 const apiRoute = `${apiEndpointTest}/data/${lvl}/${fileKey}/json`;

    //                 fetch(apiRoute, {
    //                     method: 'GET',
    //                 })
    //                     .then(response => response.json())
    //                     .then(data => {
    //                         jsonDataCache[fileKey] = data;
    //                     });
    //             }
    //         });
    //     });
    // };

    let isInitialRun = true;
    let updateInterval;
    let mouseMoveListener;

    onMount(async () => {
        const allListData = await getAllListData();
        const allPrefixes = generateAllPrefixesByCode(allListData);
        const currentPrefixes = allPrefixes[productType()][productCode()];
        // setActivePrefixes(currentPrefixes);
        const currentPrefix = currentPrefixes[currentPrefixes.length - 1];
        setMaxTiltIndex(allListData[productType()][currentPrefix].sweeps - 1);
        setTimeIndex(currentPrefixes.length - 1);

        await handleCacheImages();

        setFilePrefix(currentPrefix);

        const initFilename = `${filePrefix()}_${productType()}_idx0`;
        // const initImgPath = `/${plotsPath()}/${initFilename}.${imgExt}`;
        // const initJsonPath = `/${plotsPath()}/${initFilename}.json`;
        // // console.log(initJsonPath);

        // const initResponse = await fetch(initJsonPath);
        // const data = await initResponse.json();

        // setOverlayData(data);

        await getJson(initFilename, false);
        const initImgUrl = await preloadImage(initFilename);
        const data = overlayData();
        // const initJsonPath = initFilename

        await generateProductCodes();

        const mapboxAccessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
        mapboxgl.accessToken = mapboxAccessToken;

        mapRef.current = new mapboxgl.Map({
            container: 'map',
            zoom: 7.8,
            center: mapOrigin,
            accessToken: mapboxAccessToken,
        });

        mapRef.current.on('load', () => {
            mapRef.current.addSource('radar', {
                type: 'image',
                url: initImgUrl,
                coordinates: [
                    data.bounding_box_lon_lat.nw,
                    data.bounding_box_lon_lat.ne,
                    data.bounding_box_lon_lat.se,
                    data.bounding_box_lon_lat.sw,
                ],
            });

            mapRef.current.addLayer({
                id: 'radar-layer',
                type: 'raster',
                source: 'radar',
                paint: {
                    'raster-opacity': 0.85,
                    'raster-fade-duration': 0,
                },
            });
            console.log('setIsOverlayLoaded(true)');
            setIsOverlayLoaded(true);
        });

        mouseMoveListener = mapRef.current.on('mousemove', e => {
            setMoveEvent(e);
        });

        // console.log('setIsUpToDate(true)');
        setIsUpToDate(true);
        // setIsCaching(false);
        // bulkCacheJson();
        updateInterval = setInterval(checkUpdates, 10000); // Check every 2 minutes (120000 ms)
    });

    onCleanup(() => {
        clearInterval(updateInterval); // Clear the interval on component unmount
        if (mapRef.current) {
            mapRef.current.off('mousemove', mouseMoveListener);
        }
        clearInterval(tiltAnimationInterval);
        clearInterval(forwardAnimationInterval);
        clearInterval(reverseAnimationInterval);
    });

    const getCoordinates = data => [
        data.bounding_box_lon_lat.nw,
        data.bounding_box_lon_lat.ne,
        data.bounding_box_lon_lat.se,
        data.bounding_box_lon_lat.sw,
    ];

    const updateOverlay = () => {
        console.log(`running updateOverlay...`);
        if (!ensureProduct()) return false;

        const fileKey = `${filePrefix()}_${productType()}_idx${tiltIndex()}`;
        const imageURL = `${plotsPath()}/${fileKey}`;

        if (jsonDataCache[fileKey]) {
            console.log('DEBUG: Getting cached json data:', `${fileKey}.json `);
            const data = jsonDataCache[`${fileKey}`];

            if (data) {
                setOverlayData(data);
                mapRef.current
                    .getSource('radar')
                    .setCoordinates(getCoordinates(data));
            } else {
                console.error(
                    `Invalid image coordinates in ${fileKey}.json (cached)`
                );
            }
        } else {
            console.log('DEBUG: Getting new json data:', `${fileKey}.json `);
            getJson(fileKey);
        }

        if (imageCache[fileKey]) {
            console.log('DEBUG: Getting cached overlay:', fileKey);
            mapRef.current.getSource('radar').updateImage({
                url: imageCache[fileKey],
            });
        } else {
            try {
                console.log('DEBUG: Getting new overlay:', imageURL);
                preloadImage(imageURL).then(dataURL => {
                    mapRef.current.getSource('radar').updateImage({
                        url: dataURL,
                    });
                });
            } catch (error) {
                console.error('Image preloading failed:', error);
            }
        }
    };

    createEffect(() => {
        switch (productType()) {
            case 'reflectivity':
                console.log('DEBUG: reflectivity setting level 2');
                setLevel('2');
                break;
            case 'hydrometeor':
                console.log('DEBUG: hydrometeor setting level 3');
                setLevel('3');
                break;
            case 'precipitation':
                console.log('DEBUG: precipitation setting level 3');
                setLevel('3');
                break;
            default:
                console.log('DEBUG: DEFAULT setting level 2');
                setLevel('2');
                break;
        }
        setPlotsPath(`${plotsPathPrefix}${level()}`);
    });

    // // LEVEL 2
    // createRenderEffect(async () => {
    //     if (
    //         isOverlayLoaded() &&
    //         // !isCaching() &&
    //         level() == '2' &&
    //         productType() == 'reflectivity'
    //     ) {
    //         if (isInitialRun) {
    //             isInitialRun = false;
    //             return; // Skip the first run
    //         }

    //         if (!ensureProduct()) return false;

    //         console.log('DEBUG: Inside level 2 createEffect...');

    //         const allData = allFilesData();
    //         const currentProduct = productType();
    //         const currentProductData = allData[currentProduct];
    //         const productFilePrefixes = Object.keys(currentProductData);
    //         // console.log('productFilePrefixes:', productFilePrefixes);

    //         const latestPrefix =
    //             productFilePrefixes[productFilePrefixes.length - 1];

    //         setFilePrefix(latestPrefix);

    //         const currentFile = currentProductData[latestPrefix];

    //         // setMaxTiltIndex(
    //         //     allFilesData()[productType()][
    //         //         Object.keys(allFilesData()[productType()])[
    //         //             Object.keys(allFilesData()[productType()]).length - 1
    //         //         ]
    //         //     ].sweeps - 1
    //         // );
    //         // console.log('currentFile:', currentFile);

    //         setMaxTiltIndex(currentFile.sweeps - 1);

    //         await useDebounceTimeIndex(
    //             setTimeIndex(
    //                 allPrefixesByCode()[productType()][productCode()].length - 1
    //             )
    //         );

    //         updateOverlay();
    //     }
    // });

    // LEVEL 3A
    createRenderEffect(async () => {
        if (level() == '3' && productType() != 'reflectivity') {
            console.log('DEBUG: Inside level 3 createEffect...');
            setCodeOptions(allProductCodes()[productType()]);
        }
    });

    const handleTimeIndex = () => {
        useDebounceTimeIndex(
            setTimeIndex(
                allPrefixesByCode()[productType()][productCode()].length - 1
            )
        );
    };

    // TILT SLIDERS LISTENER
    createEffect(() => {
        const tiltSlider = document.getElementById('tilt-slider');

        if (
            isOverlayLoaded() &&
            level() == '2' &&
            productType() == 'reflectivity' &&
            tiltSlider
        ) {
            const handler = async e => {
                pauseAllAnimations();
                await useDebounceTiltIndex(
                    setTiltIndex(parseInt(e.target.value))
                );
                updateOverlay();
            };
            tiltSlider.addEventListener('input', handler);

            onCleanup(() => {
                tiltSlider.removeEventListener('input', handler);
            });
        }
    });

    // TILT SLIDERS ELEMENTS
    createEffect(() => {
        const tiltSlider = document.getElementById('tilt-slider');

        if (isOverlayLoaded() && level() == '2' && tiltSlider) {
            console.log('DEBUG:: inside level TWO (2) tiltSlider create ticks');

            const tiltSliderTicks =
                document.getElementById('tilt-slider-ticks');

            const maxTiltIdx = maxTiltIndex() + 1;

            tiltSliderTicks.innerHTML = '';
            for (let i = maxTiltIdx; i > 0; i--) {
                const tick = document.createElement('code');
                tick.textContent = i;
                tick.classList.add('tilt-slider-tick');
                tiltSliderTicks.appendChild(tick);
            }
        }
    });

    // TIME SLIDER LISTENER
    createEffect(() => {
        const timeSlider = document.getElementById('time-slider');

        if (isOverlayLoaded() && timeSlider) {
            const handler = async e => {
                console.log('DEBUG:: inside timeSlider addEventListener');
                pauseAllAnimations();
                const index = parseInt(e.target.value);
                await useDebounceTimeIndex(setTimeIndex(index));
                setupOverlay();
            };
            timeSlider.addEventListener('input', handler);

            onCleanup(() => {
                timeSlider.removeEventListener('input', handler);
            });
        }
    });

    // TIME SLIDER ELEMENTS
    createEffect(() => {
        const timeSlider = document.getElementById('time-slider');
        const timeSliderTicks = document.getElementById('time-slider-ticks');

        if (
            isOverlayLoaded() &&
            timeSlider &&
            timeSliderTicks //&&
            // activePrefixes()
        ) {
            if (!ensureProduct()) return false;
            console.log('DEBUG:: inside timeSlider create ticks');

            const currentPrefixes =
                allPrefixesByCode()[productType()][productCode()];

            // console.log('currentPrefixes:', currentPrefixes);

            timeSlider.max = currentPrefixes.length - 1; //.toString();
            timeSliderTicks.innerHTML = '';

            currentPrefixes.forEach((pfx, i) => {
                const tickContainer = document.createElement('code');
                tickContainer.id = 'time-slider-tick-container';

                const tickLine = document.createElement('div');
                tickLine.className = 'tickline';

                const splitPrefix = pfx.split('_');
                const tickTime = document.createElement('div');
                const datePart = splitPrefix[0].slice(4);
                const timePart = splitPrefix[1];

                const hour = parseInt(timePart.substring(0, 2));
                const minute = timePart.substring(2, 4);
                const displayTime = `${hour}:${minute}`;
                tickTime.textContent = displayTime;

                if (i < timeSlider.max) {
                    const nextSplitPrefix = currentPrefixes[i + 1].split('_');
                    const nextDatePart = nextSplitPrefix[0].slice(4);
                    const nextTimePart = nextSplitPrefix[1];
                    const nextHour = parseInt(nextTimePart.substring(0, 2));

                    if (
                        hour >= 23 &&
                        nextHour >= 0 &&
                        nextDatePart > datePart
                    ) {
                        const dayLine = document.createElement('div');
                        dayLine.id = 'time-slider-day-line';
                        tickContainer.appendChild(dayLine);
                    }
                }

                tickContainer.appendChild(tickLine);
                tickContainer.appendChild(tickTime);

                tickTime.classList.add('time-slider-tick');
                timeSliderTicks.appendChild(tickContainer);
            });
        }
    });

    return (
        <div
            style={{
                width: '100vw',
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <div id="map" style={{ flex: 1 }}></div>

            {isOverlayLoaded() && (
                <>
                    {!isUpToDate() && <UpdateAlert />}

                    <ResetBtn map={mapRef.current} mapOrigin={mapOrigin} />

                    <MouseLatLng moveEvent={moveEvent} />

                    {level() == '2' && (
                        <ControlBox
                            tiltIndex={tiltIndex}
                            setTiltIndex={setTiltIndex}
                            maxTiltIndex={maxTiltIndex}
                            pauseAllAnimations={pauseAllAnimations}
                            overlayData={overlayData}
                            useDebounceTiltIndex={useDebounceTiltIndex}
                            updateOverlay={updateOverlay}
                            isTiltPlaying={isTiltPlaying}
                            startTiltAnimation={startTiltAnimation}
                        />
                    )}

                    <ControlBar
                        isTimePlaying={isTimePlaying}
                        isTimePlayingReverse={isTimePlayingReverse}
                        timeAnimationSpeed={timeAnimationSpeed}
                        cycleTimeAnimationSpeed={cycleTimeAnimationSpeed}
                        startForwardTimeAnimation={startForwardTimeAnimation}
                        startReverseTimeAnimation={startReverseTimeAnimation}
                        moveForwardTimeFrame={moveForwardTimeFrame}
                        moveBackwardTimeFrame={moveBackwardTimeFrame}
                        skipToLastTimeFrame={skipToLastTimeFrame}
                        skipToFirstTimeFrame={skipToFirstTimeFrame}
                    />
                    <div id="type-code-select-container">
                        {allProductCodes() && (
                            <TypeSelect
                                productType={productType}
                                productTypes={productTypes}
                                setProductType={setProductType}
                                pauseAllAnimations={pauseAllAnimations}
                                setProductCode={setProductCode}
                                timeAnimationSpeed={timeAnimationSpeed}
                                setTimeAnimationSpeed={setTimeAnimationSpeed}
                                productCode={productCode}
                                L2CODE={L2CODE}
                                allFilesData={allFilesData}
                                setFilePrefix={setFilePrefix}
                                setMaxTiltIndex={setMaxTiltIndex}
                                useDebounceTimeIndex={useDebounceTimeIndex}
                                setTimeIndex={setTimeIndex}
                                allPrefixesByCode={allPrefixesByCode}
                                updateOverlay={updateOverlay}
                            ></TypeSelect>
                        )}

                        {allProductCodes() &&
                            codeOptions() &&
                            level() != '2' && (
                                <CodeSelect
                                    codeOptions={codeOptions}
                                    productCode={productCode}
                                    setProductCode={setProductCode}
                                    pauseAllAnimations={pauseAllAnimations}
                                    productType={productType}
                                    L2CODE={L2CODE}
                                    useDebounceTimeIndex={useDebounceTimeIndex}
                                    setTimeIndex={setTimeIndex}
                                    allPrefixesByCode={allPrefixesByCode}
                                    isOverlayLoaded={isOverlayLoaded}
                                    setupOverlay={setupOverlay}
                                    cachedProducts={cachedProducts}
                                    handleCacheImages={handleCacheImages}
                                ></CodeSelect>
                            )}
                    </div>
                    {level() == '2' && (
                        <div id="tilt-slider-container">
                            <input
                                id="tilt-slider"
                                type="range"
                                min="0"
                                max={maxTiltIndex()}
                                value={tiltIndex()}
                            />
                            <div id="tilt-slider-ticks"></div>
                        </div>
                    )}

                    <div id="time-slider-container">
                        <div id="time-slider-input-container">
                            <input
                                id="time-slider"
                                type="range"
                                min="0"
                                max={
                                    allPrefixesByCode()[productType()][
                                        productCode()
                                    ]
                                        ? allPrefixesByCode()[productType()][
                                              productCode()
                                          ].length - 1
                                        : timeIndex()
                                }
                                value={timeIndex()}
                                disable={level() == '3' && !productCode()}
                            />
                        </div>
                        <div id="time-slider-ticks"></div>
                    </div>

                    <img
                        src={`/colorbars/${productType()}_colorbar.png`}
                        id="colorbar"
                    />
                </>
            )}
            {(!isOverlayLoaded() || isCaching()) && (
                <>
                    <div id="loading-container">
                        <code id="loading-text">
                            {!isOverlayLoaded() ? (
                                <span>
                                    {cacheCount() / cacheTotal() >= 0.575
                                        ? 'caching'
                                        : 'loading'}
                                </span>
                            ) : (
                                <span>
                                    {cacheCount() / cacheTotal() >= 0.575
                                        ? 'caching'
                                        : 'updating'}
                                </span>
                            )}
                            <span id="loading-dots">...</span>
                        </code>
                        <div id="loading-bar">
                            <div
                                class="loading-box"
                                style={{
                                    width: `${(cacheCount() / cacheTotal()) * 100}%`,
                                }}
                            ></div>
                        </div>
                    </div>
                    {!isOverlayLoaded() ? (
                        <div id="loading-overlay"></div>
                    ) : (
                        <div id="updating-overlay"></div>
                    )}
                </>
            )}
        </div>
    );
};

export default App;
