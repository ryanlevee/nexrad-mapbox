# NEXRAD Weather Radar Viewer with Mapbox

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Live Demo:** [**NEXRAD Mapbox on Netlify**](https://nexradmapbox.netlify.app/)
* Current live demo displays data from March 21, 2025 for the KPDT site only. Real-time data functionality is working, but turned off for the moment. 

**Backend Repository:** [**NEXRAD Mapbox backend repository**](https://github.com/ryanlevee/nexrad-mapbox-backend)

---

## Overview

This project is a high-performance, interactive web application designed to visualize NEXRAD (Next-Generation Radar) weather data on a dynamic map interface powered by Mapbox GL JS. Built with the reactive JavaScript framework SolidJS, it allows users to explore various radar products (like reflectivity, hydrometeor classification, and precipitation) across different timestamps and radar elevation angles (tilts). The focus was on creating a fluid user experience with smooth animations and efficient data handling, showcasing modern frontend development techniques.

This application fetches processed radar imagery and metadata from a custom backend API, displaying it as an overlay on the map. It provides intuitive controls for data selection, time-based animation, and (for specific products) tilt angle adjustments.

![Application Screenshot/GIF](public/assets/gif/nexrad_mapbox_animation.gif)

---

## Key Features

* **Interactive Map Interface:** Utilizes Mapbox GL JS for panning, zooming, and displaying radar data overlays.
* **NEXRAD Data Visualization:** Displays Level 2 (Reflectivity) and Level 3 (Hydrometeor, Precipitation) radar products.
* **Data Product Selection:** Allows users to switch between available radar data types (e.g., Reflectivity, Hydrometeor) and specific product codes (for Level 3 data) via intuitive dropdowns.
* **Time-Based Animation:**
    * Smoothly animates radar scans over time.
    * Controls for Play (Forward/Reverse), Pause, Step (Forward/Backward), Skip to Start/End.
    * Adjustable animation speed (0.5x to 3x).
    * Dynamic time slider with generated tick marks representing available scan times.
* **Tilt Angle Control (Level 2 Reflectivity):**
    * Step through different radar elevation angles (tilts).
    * Animate through available tilt angles.
    * Displays the current elevation angle in degrees.
    * Dynamic tilt slider representing available sweeps.
* **Performance Optimization:** Implements aggressive client-side caching for both radar images (as Base64 Data URLs) and JSON metadata to ensure fluid animations and reduce API load. Includes preloading and smart cache cleaning.
* **Real-time Data Awareness:** Periodically checks the backend API for new data availability and updates the interface accordingly, indicating loading/updating states.
* **User Experience Enhancements:**
    * Displays mouse coordinates (screen pixels and longitude/latitude) over the map.
    * Provides a "Reset View" button to return to the default map position and zoom.
    * Clear loading and updating indicators with progress bars during caching.
    * Debounced slider inputs to prevent excessive updates during dragging.
    * Displays relevant color bars corresponding to the selected radar product.

---

## Technology Stack

* **Frontend Framework:** [SolidJS](https://www.solidjs.com/) (Leveraging fine-grained reactivity for performance)
* **Mapping Library:** [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/api/)
* **Programming Language:** JavaScript (ESNext)
* **Styling:** CSS3 (with potential CSS modules or styling libraries if used)
* **Build Tool:** Vite (presumed based on `import.meta.env`)
* **State Management:** SolidJS Signals (`createSignal`, `createEffect`, etc.)
* **API Communication:** Native `Workspace` API
* **Backend:** Custom API hosted on [Render.com](https://render.com/) (Responsible for serving pre-processed NEXRAD data files and lists) - *[Optionally mention backend language/framework if known, e.g., Python/Flask, Node/Express]*
* **Environment:** Node.js

---

## Technical Highlights & Challenges

This project presented several technical challenges and opportunities to implement robust frontend solutions:

1.  **Performance Optimization & Caching:**
    * **Challenge:** Displaying and animating potentially hundreds of radar images smoothly requires minimizing network requests and rendering overhead.
    * **Solution:** Implemented a multi-layered caching strategy:
        * `imageCache`: Stores fetched radar images (converted to Base64 Data URLs via `FileReader`) keyed by their unique identifiers. This allows instant retrieval for animation frames or repeated views without re-fetching.
        * `jsonDataCache`: Caches the JSON metadata (bounding boxes, elevation angles) associated with each radar image frame.
        * **Bulk Caching (`bulkCacheImages`):** Proactively fetches and caches all images for the *currently selected* product code upon selection or data update, improving animation smoothness significantly after an initial load.
        * **Cache Cleaning (`cleanOldCache`):** Removes outdated cache entries when new data invalidates old prefixes, preventing unbounded memory usage.
        * **Result:** Significantly reduced API calls and enabled fluid time/tilt animations even with large datasets.

2.  **State Management with SolidJS:**
    * **Challenge:** Managing numerous interconnected state variables (selected product, time index, tilt index, animation states, loading status, fetched data, cache status) while ensuring the UI reacts efficiently.
    * **Solution:** Leveraged SolidJS's fine-grained reactivity model:
        * Used `createSignal` extensively for atomic state pieces.
        * Employed `createEffect` to reactively trigger side effects like fetching data, updating Mapbox layers, managing `setInterval` for animations, and updating slider DOM elements based on data changes.
        * Utilized `createRenderEffect` for effects that needed to run *before* the next paint (e.g., preparing code options based on the selected product type).
        * **Result:** A declarative and performant UI that updates precisely when needed, without manual DOM manipulation or complex state synchronization logic.

3.  **Asynchronous Operations & API Integration:**
    * **Challenge:** Handling numerous asynchronous `Workspace` calls for data listings, JSON metadata, and image blobs, while managing loading states and preventing race conditions.
    * **Solution:** Consistent use of `async/await` syntax for cleaner asynchronous code flow. Implemented loading states (`isCaching`, `isOverlayLoaded`) tied to promise resolution to provide user feedback. Carefully orchestrated data fetching sequences in `onMount` and update checks.

4.  **Mapbox GL JS Integration:**
    * **Challenge:** Dynamically updating the radar image overlay and its coordinates on the Mapbox map as the user interacts with time/tilt sliders or selects different products.
    * **Solution:** Utilized Mapbox GL JS API methods effectively:
        * `map.addSource` and `map.addLayer` on initial load.
        * `source.setCoordinates` to update the georeferencing of the overlay based on fetched JSON data.
        * `source.updateImage` to swap the displayed radar image, referencing cached Data URLs for optimal performance.
        * Managed map event listeners (`on('mousemove')`, `on('load')`) for interactivity and initialization.

5.  **Complex UI Controls:**
    * **Challenge:** Implementing the logic for time/tilt animations (play/pause/step/speed), ensuring sliders update correctly based on available data, and handling user input smoothly.
    * **Solution:**
        * Managed animation states using boolean signals (`isTimePlaying`, `isTiltPlaying`, etc.).
        * Used `setInterval` for animations, carefully managing interval IDs and clearing them (`onCleanup`, `pauseAllAnimations`) to prevent memory leaks and unwanted behavior.
        * Implemented custom debouncing (`useDebounce`) for slider `input` events to avoid overwhelming the `updateOverlay` function during rapid slider movement.
        * Dynamically generated slider tick marks and labels in `createEffect` based on the `allPrefixesByCode` data structure.

---

## Setup and Local Development

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/ryanlevee/nexrad-mapbox-backend.git
    cd nexrad-mapbox
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Set up Environment Variables:**
    * Create a `.env` file in the project root.
    * Add your Mapbox access token:
        ```
        VITE_MAPBOX_ACCESS_TOKEN=pk.YOUR_MAPBOX_ACCESS_TOKEN
        ```

4.  **Run the development server:**
    ```bash
    npm run dev
    # or
    yarn dev
    ```

5.  Open your browser to `http://localhost:5173` (or the port specified by Vite).

---

## API Backend

This frontend application relies on a companion backend service ([`nexrad-mapbox-backend`](https://github.com/ryanlevee/nexrad-mapbox-backend)) hosted on [Render](https://render.com/). The backend is responsible for:

* Periodically fetching raw NEXRAD data.
* Processing the data into georeferenced PNG images and associated JSON metadata files (containing bounding box coordinates, elevation angles, timestamps, etc.).
* Providing API endpoints for the frontend to:
    * List available data products and files (`/list-all/`).
    * List available product codes (`/code/`).
    * Retrieve specific PNG images (`/data/{level}/{fileKey}/png`).
    * Retrieve specific JSON metadata files (`/data/{level}/{fileKey}/json`).

---

## Future Enhancements (Ideas)

* Refactor to use Context API for "Time", "Controls", "Data", and "Products".
* Implement a comprehensive database, rather than raw data delievered via JSON files.
* Implement date range selection for querying historical data.
* Add more NEXRAD products (e.g., Velocity, Spectrum Width).
* Integrate additional map layers (e.g., warnings, storm reports, satellite imagery).
* Add a location search feature.
* Allow users to select different Mapbox base map styles.
* Implement user preferences (e.g., default location, preferred product).

---

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/ryanlevee/nexrad-mapbox/blob/main/LICENSE) file for details.

---

## Contact

Ryan Levee - [GitHub](https://github.com/ryanlevee) | [LinkedIn](https://www.linkedin.com/in/ryanlevee/) | [Email](mailto:ryanlevee@gmail.com)

---
