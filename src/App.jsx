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

const App = () => {
    const basePath = '.';
    const plotsPathPrefix = `${basePath}/plots_level`;
    const listsPath = `${basePath}/lists`;

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

    const [isOverlayLoaded, setIsOverlayLoaded] = createSignal(false);

    const [level, setLevel] = createSignal('2');
    const [plotsPath, setPlotsPath] = createSignal(
        `${plotsPathPrefix}${level()}`
    );

    const [productCode, setProductCode] = createSignal(null);
    const [productType, setProductType] = createSignal('reflectivity');

    const animationSpeeds = [0.5, 1, 1.5, 2, 2.5, 3];

    const [codeOptions, setCodeOptions] = createSignal(null);
    const [allProductCodes, setAllProductCodes] = createSignal(null);
    const [filePrefix, setFilePrefix] = createSignal('');
    const [overlayData, setOverlayData] = createSignal({});
    const [filesData, setFilesData] = createSignal(null);
    const [timeFilePrefixes, setTimeFilePrefixes] = createSignal([]);
    const [tiltIndex, setTiltIndex] = createSignal(0);
    const [timeIndex, setTimeIndex] = createSignal(null);
    const [maxTiltIndex, setMaxTiltIndex] = createSignal(null);
    const [moveEvent, setMoveEvent] = createSignal(null);

    const [isTiltPlaying, setIsTiltPlaying] = createSignal(false);
    const [isTimePlaying, setIsTimePlaying] = createSignal(false);
    const [isTimePlayingReverse, setIsTimePlayingReverse] = createSignal(false);
    const [timeAnimationSpeed, setTimeAnimationSpeed] = createSignal(1);
    let tiltAnimationInterval;
    let animationInterval;
    let reverseAnimationInterval;

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

    const setupOverlay = () =>
        // origin = 'ERROR: NO ORIGIN PROVIDED FOR setupOverlay()'
        {
            // console.log('running debouncedSetupOverlay()...');

            const newFilePrefix = timeFilePrefixes()[timeIndex()];
            setFilePrefix(newFilePrefix);

            const newFileData = filesData()[newFilePrefix];
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
            pauseTimeAnimation();
        } else if (wasPlayingReverse) {
            pauseReverseTimeAnimation();
        }

        if (speed) {
            console.log(speed);
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
                productCode() == null) ||
            (level() == '3' && productCode() && tiltIndex() == 0)
        ) {
            return true;
        }
        return false;
    };

    const startForwardTimeAnimation = () => {
        // console.log('playing');
        if (!ensureProduct()) return false;
        if (!animationInterval) {
            setIsTimePlaying(true);
            setIsTimePlayingReverse(false);
            pauseReverseTimeAnimation();
            animationInterval = setInterval(async () => {
                await useDebounceTimeAnimation(
                    setTimeIndex(prevIndex => {
                        const nextIndex = prevIndex + 1;
                        return nextIndex >= timeFilePrefixes().length
                            ? 0
                            : nextIndex;
                    })
                );
                setupOverlay();
                // debouncedSetupOverlay();
                // 'debouncedSetupOverlay() playing animation'
                // }
            }, intervalMs / timeAnimationSpeed());
        } else {
            pauseTimeAnimation();
        }
    };

    const startReverseTimeAnimation = () => {
        // console.log('reverse playing');
        if (!ensureProduct()) return false;
        if (!reverseAnimationInterval) {
            setIsTimePlayingReverse(true);
            setIsTimePlaying(false);
            pauseTimeAnimation();
            reverseAnimationInterval = setInterval(async () => {
                await useDebounceTimeAnimation(
                    setTimeIndex(prevIndex => {
                        const nextIndex = prevIndex - 1;
                        return nextIndex < 0
                            ? timeFilePrefixes().length - 1
                            : nextIndex;
                    })
                );
                setupOverlay();
                // debouncedSetupOverlay();
                // 'debouncedSetupOverlay() reverse playing animation'
            }, intervalMs / timeAnimationSpeed());
        } else {
            pauseReverseTimeAnimation();
        }
    };

    const startTiltAnimation = () => {
        // if (!ensureProduct()) return false;
        console.log('tiltAnimationInterval:', tiltAnimationInterval);

        if (!tiltAnimationInterval) {
            pauseAllAnimations();
            setIsTiltPlaying(true);

            tiltAnimationInterval = setInterval(async () => {
                await useDebounceTiltAnimation(
                    setTiltIndex(prevIndex => {
                        const nextIndex = prevIndex + 1;
                        return nextIndex >= maxTiltIndex() ? 0 : nextIndex;
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

    const pauseTimeAnimation = () => {
        setIsTimePlaying(false);
        clearInterval(animationInterval);
        animationInterval = null;
    };

    const pauseReverseTimeAnimation = () => {
        setIsTimePlayingReverse(false);
        clearInterval(reverseAnimationInterval);
        reverseAnimationInterval = null;
    };

    const pauseAllAnimations = () => {
        pauseTimeAnimation();
        pauseReverseTimeAnimation();
        pauseTiltAnimation();
    };

    const moveForwardTimeFrame = async () => {
        if (!ensureProduct()) return false;
        pauseAllAnimations();
        if (timeIndex() == timeFilePrefixes().length - 1) {
            skipToFirstTimeFrame();
        } else {
            await useDebounceTimeAnimation(
                setTimeIndex(prevIndex =>
                    Math.min(prevIndex + 1, timeFilePrefixes().length - 1)
                )
            );
        }
        setupOverlay();
        // debouncedSetupOverlay();
        // 'debouncedSetupOverlay() move forward btn'
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
        }
        setupOverlay();
        // debouncedSetupOverlay();
        // 'debouncedSetupOverlay() move backward btn'
    };

    const skipToLastTimeFrame = async () => {
        if (!ensureProduct()) return false;
        pauseAllAnimations();
        setTimeIndex(timeFilePrefixes().length - 1);
        setupOverlay();
        // debouncedSetupOverlay();
        // 'debouncedSetupOverlay() skip to first btn'
    };

    const skipToFirstTimeFrame = async () => {
        if (!ensureProduct()) return false;
        pauseAllAnimations();
        await useDebounceTimeAnimation(setTimeIndex(0));
        setupOverlay();
        // debouncedSetupOverlay();
        // 'debouncedSetupOverlay() skip to last btn'
    };

    const generateTimeFilePrefixes = async () => {
        let allFilesData = false;

        try {
            const response = await fetch(
                `/${listsPath}/nexrad_level${level()}_${productType()}_files.json`
            );
            allFilesData = await response.json();
        } catch (error) {
            console.error('Error fetching file list:', error);
        }

        if (!allFilesData) return false;

        let selectFilesData;

        if (level() == '2') {
            selectFilesData = allFilesData;
        } else if (level() == '3') {
            selectFilesData = Object.entries(allFilesData).reduce(
                (acc, [key, value]) => {
                    const fnParts = key.split('_');
                    if (fnParts[fnParts.length - 1] == productCode())
                        acc[key] = value;
                    return acc;
                },
                {}
            );
        }

        const sortedFilesData = Object.keys(selectFilesData)
            .sort()
            .reduce((obj, key) => {
                obj[key] = selectFilesData[key];
                return obj;
            }, {});

        setFilesData(sortedFilesData);
        const fileNames = Object.keys(sortedFilesData);

        if (!fileNames || fileNames.length === 0) {
            setTimeFilePrefixes([]);
            return;
        }

        // const latestFileName = fileNames[fileNames.length - 1];
        // const latestPrefix = latestFileName.replace('.png', '');
        // const latestTimePart = latestPrefix.split('_')[1];
        // const latestYear = latestPrefix.substring(4, 8);
        // const latestMonth = latestPrefix.substring(8, 10);
        // const latestDay = latestPrefix.substring(10, 12);
        // const latestHour = latestTimePart.substring(0, 2);
        // const latestMinute = latestTimePart.substring(2, 4);
        // const latestSecond = latestTimePart.substring(4, 6);

        // const realTime = false;

        // let latestFileTime;

        // if (realTime) {
        //     latestFileTime = new Date();
        // } else {
        //     latestFileTime = new Date(
        //         Date.UTC(
        //             parseInt(latestYear, 10),
        //             parseInt(latestMonth, 10) - 1,
        //             parseInt(latestDay, 10),
        //             parseInt(latestHour, 10),
        //             parseInt(latestMinute, 10),
        //             parseInt(latestSecond, 10)
        //         )
        //     );
        // }

        // const threeHoursBeforeLatest = new Date(
        //     latestFileTime.getTime() - 3 * 60 * 60 * 1000
        // );

        const filteredPrefixes = fileNames.reduce((acc, fileName) => {
            const prefix = fileName.replace('.png', '');
            // const timePart = prefix.split('_')[1];
            // const year = prefix.substring(4, 8);
            // const month = prefix.substring(8, 10);
            // const day = prefix.substring(10, 12);
            // const hour = timePart.substring(0, 2);
            // const minute = timePart.substring(2, 4);
            // const second = timePart.substring(4, 6);

            // const fileTime = new Date(
            //     Date.UTC(
            //         parseInt(year, 10),
            //         parseInt(month, 10) - 1,
            //         parseInt(day, 10),
            //         parseInt(hour, 10),
            //         parseInt(minute, 10),
            //         parseInt(second, 10)
            //     )
            // );

            // if (
            //     fileTime >= threeHoursBeforeLatest &&
            //     fileTime <= latestFileTime
            // ) {
            acc.push(prefix);
            // }
            return acc;
        }, []);

        console.log('filteredPrefixes:', filteredPrefixes);

        setTimeFilePrefixes(filteredPrefixes);
        return filteredPrefixes;
    };

    const findMaxTiltIndex = prefix => {
        if (filesData() && prefix in filesData()) {
            setMaxTiltIndex(filesData()[prefix].sweeps - 1);
        }
    };

    const generateProductCodes = async () => {
        const response = await fetch(`${basePath}/codes/options.json`);
        const codes = await response.json();
        setAllProductCodes(codes);
    };

    onCleanup(() => {
        if (mapRef.current) {
            mapRef.current.remove();
        }
        pauseAllAnimations();
        Object.keys(imageCache).forEach(key => delete imageCache[key]);
    });

    const imgExt = '.png';
    const mapOrigin = [-118.8529281616211, 45.690650939941406];

    // const minLon = -125.2377333903419
    // const maxLon = -112.46812293290029
    // const minLat = 41.41970157759364
    // const maxLat = 49.65414849522832

    // const testCoords = {
    //     nw: [minLon, maxLat],
    //     ne: [maxLon, maxLat],
    //     se: [maxLon, minLat],
    //     sw: [minLon, minLat],
    // };

    const preloadImage = url => {
        // console.log('preloading image...');
        return new Promise((resolve, reject) => {
            fetch(url)
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

    const cacheImage = imageKey => {
        fetch(`/${plotsPath()}/${imageKey}.png`)
            .then(response => response.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    // console.log(`saving ${imageKey} to cache`);
                    imageCache[imageKey] = reader.result;
                };
                reader.readAsDataURL(blob);
            });
    };

    const cacheAllImages = async () => {
        console.log(`Caching all ${productType()} images...`);

        const prefixes = timeFilePrefixes();

        for (let prefix of prefixes) {
            const maxIdx = filesData()[prefix].sweeps - 1;

            for (let iTilt = 0; iTilt <= maxIdx; iTilt++) {
                const imageKey = `${prefix}_${productType()}_idx${iTilt}`;
                cacheImage(imageKey);
            }
        }

        if (level() == '3') cachedProducts[productType()][productCode()] = true;
    };

    onMount(async () => {
        const filePrefixes = await generateTimeFilePrefixes();
        const prefix = filePrefixes[filePrefixes.length - 1];

        findMaxTiltIndex(prefix);
        await cacheAllImages();

        setFilePrefix(prefix);

        const initFilename = `${filePrefix()}_${productType()}_idx0`;
        const initImgPath = `/${plotsPath()}/${initFilename}${imgExt}`;
        const initJsonPath = `/${plotsPath()}/${initFilename}.json`;
        const initResponse = await fetch(initJsonPath);
        const data = await initResponse.json();

        setOverlayData(data);
        generateProductCodes();

        const mapboxAccessToken = import.meta.env.MAP_TOKEN;
        mapboxgl.accessToken = mapboxAccessToken;

        mapRef.current = new mapboxgl.Map({
            container: 'map',
            zoom: 7.8,
            center: mapOrigin,
            // style:'mapbox://styles/mapbox/outdoors-v11'
        });

        mapRef.current.on('load', () => {
            mapRef.current.addSource('radar', {
                type: 'image',
                url: initImgPath,
                coordinates: [
                    data.bounding_box_lon_lat.nw,
                    data.bounding_box_lon_lat.ne,
                    data.bounding_box_lon_lat.se,
                    data.bounding_box_lon_lat.sw,
                    // testCoords.nw,
                    // testCoords.ne,
                    // testCoords.se,
                    // testCoords.sw,
                ],
                tileSize: 256,
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
            console.log(`All ${productType()} images cached.`);
        });

        mapRef.current.on('mousemove', e => {
            setMoveEvent(e);
        });

        setTimeIndex(filePrefixes.length - 1);
    });

    const getCoordinates = data => [
        data.bounding_box_lon_lat.nw,
        data.bounding_box_lon_lat.ne,
        data.bounding_box_lon_lat.se,
        data.bounding_box_lon_lat.sw,
        // testCoords.nw,
        // testCoords.ne,
        // testCoords.se,
        // testCoords.sw,
    ];

    const updateOverlay = () => {
        console.log(`running updateOverlay...`);
        if (!ensureProduct()) return false;

        const fileKey = `${filePrefix()}_${productType()}_idx${tiltIndex()}`;
        const imageURL = `/${plotsPath()}/${fileKey}.png`;

        if (imageCache[fileKey]) {
            console.log('DEBUG: Updating overlay with cached image:', fileKey);
            mapRef.current.getSource('radar').updateImage({
                url: imageCache[fileKey],
            });
        } else {
            try {
                console.log(
                    'DEBUG: Updating overlay with new image:',
                    imageURL
                );
                preloadImage(imageURL).then(dataURL => {
                    imageCache[fileKey] = dataURL;
                    mapRef.current.getSource('radar').updateImage({
                        url: dataURL,
                    });
                });
            } catch (error) {
                console.error('Image preloading failed:', error);
            }
        }

        if (jsonDataCache[fileKey]) {
            console.log('DEBUG: Getting cached json:', `${fileKey}.json `);
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
            console.log('DEBUG: Getting new json:', `${fileKey}.json `);
            fetch(`/${plotsPath()}/${fileKey}.json`)
                .then(response => response.json())
                .then(data => {
                    setOverlayData(data);
                    jsonDataCache[fileKey] = data;

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

    // LEVEL 2
    createRenderEffect(async () => {
        if (
            isOverlayLoaded() &&
            // level() == '2' &&
            // !productCode() &&
            productType() == 'reflectivity'
        ) {
            if (!ensureProduct()) return false;
            console.log('DEBUG: Inside level 2 createEffect...');
            const newFilePrefixes = await generateTimeFilePrefixes();
            setFilePrefix(newFilePrefixes[newFilePrefixes.length - 1]);
            const currentFile = filesData()[filePrefix()];
            setMaxTiltIndex(currentFile.sweeps - 1);

            // await useDebounceTimeIndex(setTimeIndex(timeFilePrefixes().length - 1))
            setTimeIndex(timeFilePrefixes().length - 1);

            updateOverlay();
            // debouncedUpdateOverlay();
            // `debouncedUpdateOverlay() level 2 productType() ${productType()} createEffect`
        }
    });

    // LEVEL 3A
    createRenderEffect(async () => {
        // if (isOverlayLoaded() && level() == '3' && productType()) {
        if (level() == '3' && productType() != 'reflectivity') {
            // if (!ensureProduct()) return false;
            console.log('DEBUG: Inside level 3A createEffect...');
            setCodeOptions(allProductCodes()[productType()]);
        }
    });

    // LEVEL 3B
    createRenderEffect(async () => {
        if (
            level() == '3' &&
            productType() != 'reflectivity' &&
            productCode()
        ) {
            // if (!ensureProduct()) return false;
            console.log('DEBUG: Inside level 3B createEffect...');
            const newFilePrefixes = await generateTimeFilePrefixes();
            setFilePrefix(newFilePrefixes[newFilePrefixes.length - 1]);
            setTiltIndex(0);
            useDebounceTimeIndex(setTimeIndex(newFilePrefixes.length - 1));

            if (!cachedProducts[productType()][productCode()]) {
                await cacheAllImages();
            }

            if (isOverlayLoaded()) {
                console.log(
                    'DEBUG: Inside level 3B createEffect isOverlayLoaded()...'
                );
                updateOverlay();
                // debouncedUpdateOverlay();
                // `debouncedUpdateOverlay() level 3 productCode() ${productCode()} createEffect`
            }
        }
    });

    // TILT SLIDERS LISTENER
    createEffect(() => {
        const tiltSlider = document.getElementById('tilt-slider');

        if (
            isOverlayLoaded() &&
            level() == '2' &&
            productType() == 'reflectivity' &&
            tiltSlider
        ) {
            tiltSlider.addEventListener('input', async e => {
                pauseAllAnimations();

                console.log(
                    'DEBUG:: inside level TWO (2) tiltSlider addEventListener'
                );

                // setTiltIndex(parseInt(e.target.value));
                // useDebounce(tiltIndex(parseInt(e.target.value)), 250)
                // updateOverlay()
                // useDebounceTiltIndex((() => (setTiltIndex(parseInt(e.target.value)), updateOverlay()))(), 1000);

                await useDebounceTiltIndex(
                    setTiltIndex(parseInt(e.target.value))
                );
                updateOverlay();
                // debouncedUpdateOverlaySlider();
                // 'debouncedUpdateOverlay() tiltSlider createEffect'
            });
        }
    });

    // TILT SLIDERS ELEMENTS
    createEffect(() => {
        const tiltSlider = document.getElementById('tilt-slider');
        if (
            isOverlayLoaded() &&
            level() == '2' &&
            // productType() == 'reflectivity' &&
            tiltSlider
        ) {
            // if (!ensureProduct()) return false;
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
            timeSlider.addEventListener('input', async e => {
                console.log('DEBUG:: inside timeSlider addEventListener');
                pauseAllAnimations();
                const index = parseInt(e.target.value);
                await useDebounceTimeIndex(setTimeIndex(index));
                // setTimeIndex(index);

                setupOverlay();
                // debouncedSetupOverlaySlider();
                // debouncedSetupOverlay(
                //     // 'debouncedSetupOverlay() timeSlider createEffect'
                // );
            });
        }
    });

    // TIME SLIDER ELEMENTS
    ////////////////////////// NEED TO FIX - HITS TWICE ON OPEN //////////////////////////
    createEffect(() => {
        const timeSlider = document.getElementById('time-slider');
        const timeSliderTicks = document.getElementById('time-slider-ticks');

        if (isOverlayLoaded() && timeSlider && timeSliderTicks) {
            console.log('DEBUG:: inside timeSlider create ticks');

            timeSlider.max = timeFilePrefixes().length - 1; //.toString();
            timeSliderTicks.innerHTML = '';

            timeFilePrefixes().forEach((pfx, i) => {
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

                if (i != timeSlider.max) {
                    const nextSplitPrefix =
                        timeFilePrefixes()[i + 1].split('_');
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

            {isOverlayLoaded() ? (
                <>
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
                                max={timeFilePrefixes().length - 1}
                                value={timeIndex()}
                            />
                        </div>
                        <div id="time-slider-ticks"></div>
                    </div>

                    <img
                        src={`/colorbars/${productType()}_colorbar.png`}
                        id="colorbar"
                    />
                </>
            ) : (
                <>
                    <div id="loading-container">
                        <code id="loading-text">
                            loading<span id="loading-dots">...</span>
                        </code>
                    </div>
                    <div id="loading-overlay"></div>
                </>
            )}
        </div>
    );
};

export default App;
