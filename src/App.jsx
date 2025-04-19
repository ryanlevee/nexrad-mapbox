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
        { value: 'reflectivity', label: 'reflectivity (level 2)', level: '2' },
        { value: 'hydrometeor', label: 'hydrometeor (level 3)', level: '3' },
        {
            value: 'precipitation',
            label: 'precipitation (level 3)',
            level: '3',
        },
    ];

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
    const [allPrefixesByCode, setAllPrefixesByCode] = createSignal({});

    const [overlayData, setOverlayData] = createSignal({});
    const [allFilesData, setAllFilesData] = createSignal({});

    const [tiltIndex, setTiltIndex] = createSignal(0);
    const [timeIndex, setTimeIndex] = createSignal(null);
    const [maxTiltIndex, setMaxTiltIndex] = createSignal(null);

    const [moveEvent, setMoveEvent] = createSignal(null);

    const [isTiltPlaying, setIsTiltPlaying] = createSignal(false);
    const [isTimePlaying, setIsTimePlaying] = createSignal(false);
    const [isTimePlayingReverse, setIsTimePlayingReverse] = createSignal(false);
    const [timeAnimationSpeed, setTimeAnimationSpeed] = createSignal(1);
    const animationSpeeds = [0.5, 1, 1.5, 2, 2.5, 3];
    let tiltAnimationInterval;
    let forwardAnimationInterval;
    let reverseAnimationInterval;
    let updateInterval;
    let mouseMoveListener;

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
        if (!productCode()) return false;
        const currentProductPrefixes =
            allPrefixesByCode()[productType()][productCode()];
        const newFilePrefix = currentProductPrefixes[timeIndex()];
        setFilePrefix(newFilePrefix);
        const currentFilesData = allFilesData()[productType()];
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

    const apiEndpoint = 'https://nexrad-mapbox-backend.onrender.com';

    const getAllListData = async () => {
        const response = await fetch(`${apiEndpoint}/list-all/`, {
            method: 'GET',
        });

        const allListData = await response.json();
        if (!truthy(allListData)) return false;
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
        const response = await fetch(`${apiEndpoint}/code/`, {
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

    const checkUpdates = async () => {
        if (isCaching()) return false;
        const data = await getAllListData();
        if (!data) return false;
        setIsCaching(true);
        generateAllPrefixesByCode(data);
        generateProductCodes();
        await handleCacheImages();
    };

    const preloadImage = imageKey => {
        const apiRoute = `${apiEndpoint}/data/${level()}/${imageKey}/${imgExt}`;

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

    const cacheImage = (imageKey, i) => {
        return new Promise((resolve, reject) => {
            const apiRoute = `${apiEndpoint}/data/${level()}/${imageKey}/${imgExt}`;

            fetch(apiRoute, {
                method: 'GET',
            })
                .then(response => response.blob())
                .then(blob => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        imageCache[imageKey] = reader.result;
                        setCacheCount(i);
                        resolve(true);
                    };
                    reader.onerror = error => {
                        console.error(
                            `Error reading blob for ${imageKey}:`,
                            error
                        );
                        reject(error);
                    };
                    reader.readAsDataURL(blob);
                })
                .catch(error => {
                    console.error(`Error fetching image ${imageKey}:`, error);
                    reject(error);
                });
        });
    };

    const cleanOldCache = () => {
        const cachedImageKeys = Object.keys(imageCache).reduce(
            (acc, key) => (
                (acc[key] = key.split('_').slice(0, 3).join('_')), acc
            ),
            {}
        );

        const allPrefixes = Object.values(allPrefixesByCode())
            .flatMap(pfxObj => Object.values(pfxObj))
            .flat();

        Object.entries(cachedImageKeys).forEach(([key, value]) => {
            if (!allPrefixes.includes(value)) {
                // console.log('deleting from imageCache:', key);
                delete imageCache[key];
            }
        });
        // console.log('imageCache length AFTER:', Object.keys(imageCache).length);
    };

    const bulkCacheImages = async () => {
        // console.log('imageCache length BEFORE:', Object.keys(imageCache).length);
        if (!productCode()) return false;

        setCacheCount(0);
        let imageTotal = 0;
        const currentFilesData = allFilesData()[productType()];
        const prefixes = allPrefixesByCode()[productType()][productCode()];
        const imagePromises = [];

        let i = 0;
        prefixes.forEach(prefix => {
            const maxIdx = currentFilesData[prefix].sweeps - 1;

            for (let iTilt = 0; iTilt <= maxIdx; iTilt++) {
                const imageKey = `${prefix}_${productType()}_idx${iTilt}`;
                if (!imageCache[imageKey]) {
                    imagePromises.push(cacheImage(imageKey, i++));
                }
                setCacheTotal(imageTotal++);
            }
        });

        if (imagePromises.length) {
            // console.log('updating image cache...');
            pauseAllAnimations();
            setIsCaching(true);
            await Promise.all(imagePromises);
        }
    };

    const handleCacheImages = async () => {
        // console.log('checking for updates...');
        await bulkCacheImages();
        cleanOldCache();
        setIsCaching(false);
    };

    const getJson = async (fileKey, addToMap = true) => {
        if (!productCode()) return false;
        const apiRoute = `${apiEndpoint}/data/${level()}/${fileKey}/json`;
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
            })
            .catch(e => {
                console.error('GET 404: Using current json instead. Error:', e);
                mapRef.current
                    .getSource('radar')
                    .setCoordinates(getCoordinates(overlayData()));
            });
    };

    onMount(async () => {
        const allListData = await getAllListData();
        const allPrefixes = generateAllPrefixesByCode(allListData);
        const currentPrefixes = allPrefixes[productType()][productCode()];
        const currentPrefix = currentPrefixes[currentPrefixes.length - 1];
        setMaxTiltIndex(allListData[productType()][currentPrefix].sweeps - 1);
        setTimeIndex(currentPrefixes.length - 1);

        await handleCacheImages();
        setFilePrefix(currentPrefix);

        const initFilename = `${filePrefix()}_${productType()}_idx0`;

        await getJson(initFilename, false);
        const initImgUrl = await preloadImage(initFilename);
        const data = overlayData();

        await generateProductCodes();

        const mapboxAccessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
        mapboxgl.accessToken = mapboxAccessToken;

        mapRef.current = new mapboxgl.Map({
            container: 'map',
            zoom: 7.4,
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

            setIsOverlayLoaded(true);
        });

        mouseMoveListener = mapRef.current.on('mousemove', e => {
            setMoveEvent(e);
        });

        setIsUpToDate(true);

        updateInterval = setInterval(checkUpdates, 10000);
    });

    onCleanup(() => {
        clearInterval(updateInterval);
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
        if (!ensureProduct()) return false;

        const fileKey = `${filePrefix()}_${productType()}_idx${tiltIndex()}`;
        const imageURL = `${plotsPath()}/${fileKey}`;

        if (jsonDataCache[fileKey]) {
            const data = jsonDataCache[`${fileKey}`];

            if (data) {
                setOverlayData(data);
                mapRef.current
                    .getSource('radar')
                    .setCoordinates(getCoordinates(data));
            } else {
            }
        } else {
            getJson(fileKey);
        }

        if (imageCache[fileKey]) {
            // console.log('getting cached image:', fileKey);
            mapRef.current.getSource('radar').updateImage({
                url: imageCache[fileKey],
            });
        } else {
            try {
                // console.log('getting new image:', fileKey);
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
                setLevel('2');
                break;
            case 'hydrometeor':
                setLevel('3');
                break;
            case 'precipitation':
                setLevel('3');
                break;
            default:
                setLevel('2');
                break;
        }
        setPlotsPath(`${plotsPathPrefix}${level()}`);
    });

    createRenderEffect(async () => {
        if (level() == '3' && productType() != 'reflectivity') {
            setCodeOptions(allProductCodes()[productType()]);
        }
    });

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

    createEffect(() => {
        const tiltSlider = document.getElementById('tilt-slider');

        if (isOverlayLoaded() && level() == '2' && tiltSlider) {
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

    createEffect(() => {
        const timeSlider = document.getElementById('time-slider');

        if (isOverlayLoaded() && timeSlider) {
            const handler = async e => {
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

    createEffect(() => {
        const timeSlider = document.getElementById('time-slider');
        const timeSliderTicks = document.getElementById('time-slider-ticks');

        if (isOverlayLoaded() && timeSlider && timeSliderTicks) {
            if (!ensureProduct()) return false;

            const currentPrefixes =
                allPrefixesByCode()[productType()][productCode()];

            timeSlider.max = currentPrefixes.length - 1;
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
                const displayHour = hour >= 7 ? hour - 7 : 24 - 7 + hour;
                const minute = timePart.substring(2, 4);
                const displayTime = `${displayHour}:${minute}`;
                tickTime.textContent = displayTime;

                if (i < timeSlider.max) {
                    const nextSplitPrefix = currentPrefixes[i + 1].split('_');
                    const nextDatePart = nextSplitPrefix[0].slice(4);
                    const nextTimePart = nextSplitPrefix[1];
                    const nextHour = parseInt(nextTimePart.substring(0, 2));

                    if (
                        displayHour >= 23 &&
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
                                level={level}
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
                                handleCacheImages={handleCacheImages}
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
                                disabled={level() == '3' && !productCode()}
                            />
                        </div>
                        <div id="time-slider-ticks"></div>
                    </div>

                    <img
                        src={`/assets/colorbars/${productType()}_colorbar.png`}
                        id="colorbar"
                    />
                </>
            )}
            {(!isOverlayLoaded() || isCaching()) && (
                <div id="loading-body">
                    <div id="loading-container">
                        <code id="loading-note">Please be patient. The backend host's free tier occasionally spins down.</code>
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
                </div>
            )}
        </div>
    );
};

export default App;
