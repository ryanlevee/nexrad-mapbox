import { Show } from 'solid-js';

const MouseLatLng = props => {
    const { moveEvent } = props;

    return (
        <pre id="coords-container">
            <Show when={moveEvent()}>
                {() => (
                    <div id="coords-inner-container">
                        <div>{JSON.stringify(moveEvent().point)}</div>
                        <div>{JSON.stringify(moveEvent().lngLat.wrap())}</div>
                    </div>
                )}
            </Show>
        </pre>
    );
};

export default MouseLatLng;
