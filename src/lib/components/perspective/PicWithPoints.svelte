<script>
    import Point from './Point.svelte';
    import Pic from './Pic.svelte';
    import { avg } from '$lib/image-logic/geometry.js';

    let { src, box = $bindable(), onCropBoxChange = null, cropBox = null, hideCropBox = false, w = $bindable(), h = $bindable() } = $props();
</script>

<Pic {src} bind:a={box[0]} bind:b={box[1]} bind:c={box[2]} bind:d={box[3]} bind:w bind:h>
    {#if w && h}
        <svg class="wireframe" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <g fill-rule="evenodd" fill="#00000077">
                <path
                    d={`M 0,0 L 0,${h} ${w},${h} ${w},0 z M ${box[0][0] * w},${box[0][1] * h} L ${box
                        .slice(1)
                        .map(([x, y]) => x * w + ',' + y * h)
                        .join('  ')} z`}
                />
            </g>

            {#if cropBox && !hideCropBox}
                <polygon
                    points={cropBox.map(([x, y]) => x * w + ',' + y * h).join('  ')}
                    vector-effect="non-scaling-stroke"
                    style="fill: none; stroke-width: 1px; stroke-dashoffset:5; stroke-dasharray: 5; stroke: #0338"
                />
                <polygon
                    points={cropBox.map(([x, y]) => x * w + ',' + y * h).join('  ')}
                    vector-effect="non-scaling-stroke"
                    style="fill: none; stroke-width: 1px; stroke-dasharray: 5; stroke: #0FF8"
                />
            {/if}

            <polygon
                points={box.map(([x, y]) => x * w + ',' + y * h).join('  ')}
                vector-effect="non-scaling-stroke"
                style="fill: none; stroke-width: 0.5px; stroke: #0d6efd"
            />
        </svg>

        {#if cropBox}
            <Point
                color="cyan"
                shape="square"
                p={avg(cropBox[3], cropBox[0])}
                onMove={(point, dx, dy) => onCropBoxChange({ quadrant: 'left', dx, dy, point })}
            />

            <Point
                color="cyan"
                shape="square"
                p={avg(cropBox[0], cropBox[1])}
                onMove={(point, dx, dy) => onCropBoxChange({ quadrant: 'top', dx, dy, point })}
            />

            <Point
                color="cyan"
                shape="square"
                p={avg(cropBox[1], cropBox[2])}
                onMove={(point, dx, dy) => onCropBoxChange({ quadrant: 'right', dx, dy, point })}
            />

            <Point
                color="cyan"
                shape="square"
                p={avg(cropBox[2], cropBox[3])}
                onMove={(point, dx, dy) => onCropBoxChange({ quadrant: 'bottom', dx, dy, point })}
            />
        {/if}
    {/if}
</Pic>

<style lang="css">
    .wireframe {
        position: absolute;
        height: 100%;
        width: 100%;
        overflow: visible;
        pointer-events: none;
        user-select: none;
    }
</style>
