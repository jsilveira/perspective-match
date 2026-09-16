<script>
    import Point from './Point.svelte';
    import Btn from '$lib/components/common/Btn.svelte';
    import { avg } from '$lib/image-logic/geometry.js';

    /**
     * Image with user-drawn 2-point segments on top.
     *  - drag on the image to draw a new segment
     *  - drag an endpoint to adjust it
     *  - click a segment to select it; click it again to cycle its orientation: auto -> h -> v -> auto
     *  - press Delete/Backspace to remove the selected (or hovered) segment, Escape to deselect,
     *    or click the x at the middle of a segment
     *  - mouse wheel zooms, holding Shift zooms 4x around the cursor for fine adjustments
     *
     * @typedef {import('$lib/image-logic/orthogonalize.js').Segment} Segment
     */

    let {
        src,
        /** @type {Segment[]} */ segments = $bindable([]),
        /** @type {('h' | 'v')[]} */ families = [],
        /** @type {number[]} */ errors = [],
        onCropBoxChange = null,
        cropBox = null,
        hideCropBox = false,
        w = $bindable(),
        h = $bindable(),
        padding = 10
    } = $props();

    const COLORS = { h: '#ff9f1c', v: '#3ddc84' };
    const MIN_SEGMENT_PX = 8;

    // ------------------------------------------------------------------ image fitting & zoom
    let imgElem = $state(),
        imgH = $state(),
        imgW = $state();

    let moving = $state(false); // shift held: zoomed in for fine adjustments
    const zoomFactor = 4;
    let baseZoom = $state(1);
    let zoom = $derived(moving ? zoomFactor * baseZoom : baseZoom);
    let lastMousePosition = $state([0, 0]);
    let left = $state('0px');
    let top = $state('0px');
    let fixedZoomOffset = $state(false);

    function imgLoaded() {
        let nW = imgElem.naturalWidth;
        let nH = imgElem.naturalHeight;
        let ratio = w / h;
        let nRatio = nW / nH;

        if (ratio <= nRatio) {
            imgW = w - 2 * padding;
            imgH = (w - 2 * padding) / nRatio;
        } else {
            imgW = nRatio * (h - 2 * padding);
            imgH = h - 2 * padding;
        }
        left = (w - imgW) / 2 + 'px';
        top = (h - imgH) / 2 + 'px';
    }

    $effect(() => {
        if (imgW && w && h && src) imgLoaded();
    });

    $effect(() => {
        if (moving) {
            let z = zoomFactor * baseZoom;
            let [x, y] = lastMousePosition;
            if (!fixedZoomOffset) {
                fixedZoomOffset = true;
                setTimeout(() => {
                    left = (w - imgW) / 2 / z - imgW * (x - x / z) + 'px';
                    top = (h - imgH) / 2 / z - imgH * (y - y / z) + 'px';
                });
            }
        } else {
            fixedZoomOffset = false;
            left = (w - imgW) / 2 + 'px';
            top = (h - imgH) / 2 + 'px';
        }
    });

    function onMouseWheel(e) {
        const delta = -e.deltaY;
        baseZoom = baseZoom * (delta > 0 ? 1 / (1 - delta / 2000) : 1 + delta / 2000);
        if (baseZoom < 1) {
            left = (w - imgW * baseZoom) / 2 / baseZoom + 'px';
            top = (h - imgH * baseZoom) / 2 / baseZoom + 'px';
        }
    }

    function resetZoom() {
        baseZoom = 1;
        left = (w - imgW) / 2 + 'px';
        top = (h - imgH) / 2 + 'px';
    }

    function onKeyDown(e) {
        if (e.key === 'Shift') moving = true;
        if ((e.key === 'Delete' || e.key === 'Backspace') && creating === null) {
            const target = selectedIndex ?? hoveredIndex;
            if (target !== null && target !== undefined) {
                e.preventDefault();
                removeSegment(target);
            }
        }
        if (e.key === 'Escape') selectedIndex = null;
    }

    function onKeyUp(e) {
        if (e.key === 'Shift') moving = false;
    }

    // ------------------------------------------------------------------ segment creation
    /** @type {number | null} index of the segment being drawn */
    let creating = $state(null);
    /** @type {number | null} */
    let hoveredIndex = $state(null);
    /** @type {number | null} */
    let selectedIndex = $state(null);

    function relativePosition(e) {
        const rect = e.currentTarget.getBoundingClientRect();
        return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
    }

    function onPointerDown(e) {
        if (e.button !== 0 || e.target !== imgElem) return;
        const [mx, my] = relativePosition(e);
        segments.push({ p: [mx, my], q: [mx, my], orientation: 'auto' });
        creating = segments.length - 1;
        selectedIndex = creating;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!e.shiftKey && moving) moving = false;
        else if (e.shiftKey && !moving) moving = true;

        lastMousePosition = relativePosition(e);

        if (creating !== null && segments[creating]) {
            segments[creating].q = [...lastMousePosition];
        }
    }

    function onPointerUp(e) {
        if (creating === null) return;
        const seg = segments[creating];
        if (seg) {
            const lenPx = Math.hypot((seg.q[0] - seg.p[0]) * imgW, (seg.q[1] - seg.p[1]) * imgH);
            if (lenPx < MIN_SEGMENT_PX) {
                segments.splice(creating, 1);
                selectedIndex = null;
            }
        }
        creating = null;
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch (err) {
            /* ignore */
        }
    }

    function cycleOrientation(i) {
        const next = { auto: 'h', h: 'v', v: 'auto' };
        segments[i].orientation = next[segments[i].orientation] || 'auto';
    }

    function removeSegment(i) {
        segments.splice(i, 1);
        hoveredIndex = null;
        if (selectedIndex !== null) selectedIndex = selectedIndex === i ? null : selectedIndex > i ? selectedIndex - 1 : selectedIndex;
    }

    /** First click selects a segment, a click on the selected one cycles its orientation */
    function onSegmentClick(i) {
        if (selectedIndex === i) cycleOrientation(i);
        else selectedIndex = i;
    }

    // ------------------------------------------------------------------ drawing helpers
    const px = (p) => [p[0] * w, p[1] * h];

    function labelPos(seg) {
        // Just beside the midpoint, offset perpendicular to the segment so it does not cover it
        const [ax, ay] = px(seg.p),
            [bx, by] = px(seg.q);
        const mx = (ax + bx) / 2,
            my = (ay + by) / 2;
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const nx = -(by - ay) / len,
            ny = (bx - ax) / len;
        return [mx + nx * 14, my + ny * 14];
    }

    function deletePos(seg) {
        const [ax, ay] = px(seg.p),
            [bx, by] = px(seg.q);
        const mx = (ax + bx) / 2,
            my = (ay + by) / 2;
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const nx = -(by - ay) / len,
            ny = (bx - ax) / len;
        return [mx - nx * 14, my - ny * 14];
    }

    function errorColor(err) {
        if (err === undefined || err === null) return 'white';
        if (err < 0.5) return '#9dff9d';
        if (err < 2) return '#ffe066';
        return '#ff6b6b';
    }
</script>

<svelte:window on:keydown={onKeyDown} on:keyup={onKeyUp} />

<div bind:clientWidth={w} bind:clientHeight={h} class:moving class="outer" onwheel={onMouseWheel}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="viewport"
        class:creating={creating !== null}
        style:width={imgW + 'px'}
        style:height={imgH + 'px'}
        style:zoom
        style:--inv-zoom={1 / zoom}
        style:left
        style:top
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
    >
        {#if w && h}
            <svg class="wireframe" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
                {#if cropBox && !hideCropBox}
                    <!-- Darken everything outside the crop box, like the straighten tab does -->
                    <g fill-rule="evenodd" fill="#00000055">
                        <path
                            d={`M 0,0 L 0,${h} ${w},${h} ${w},0 z M ${cropBox[0][0] * w},${cropBox[0][1] * h} L ${cropBox
                                .slice(1)
                                .map(([x, y]) => x * w + ',' + y * h)
                                .join('  ')} z`}
                        />
                    </g>
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

                {#each segments as seg, i (seg)}
                    {@const family = families[i] || 'h'}
                    {@const color = COLORS[family]}
                    {@const forced = seg.orientation !== 'auto'}
                    {@const [ax, ay] = px(seg.p)}
                    {@const [bx, by] = px(seg.q)}
                    {@const [lx, ly] = labelPos(seg)}
                    {@const [dx, dy] = deletePos(seg)}
                    {@const err = errors[i]}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <g
                        class="segment"
                        class:hovered={hoveredIndex === i}
                        class:selected={selectedIndex === i}
                        onpointerenter={() => (hoveredIndex = i)}
                        onpointerleave={() => (hoveredIndex = hoveredIndex === i ? null : hoveredIndex)}
                    >
                        <!-- visible line -->
                        <line x1={ax} y1={ay} x2={bx} y2={by} vector-effect="non-scaling-stroke" class="line-shadow" />
                        <line
                            x1={ax}
                            y1={ay}
                            x2={bx}
                            y2={by}
                            vector-effect="non-scaling-stroke"
                            class="line"
                            style:stroke={color}
                            style:stroke-dasharray={forced ? 'none' : '6 3'}
                        />
                        <!-- wide invisible hit area: click to cycle orientation -->
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <line
                            x1={ax}
                            y1={ay}
                            x2={bx}
                            y2={by}
                            vector-effect="non-scaling-stroke"
                            class="hit"
                            onclick={(e) => {
                                e.stopPropagation();
                                onSegmentClick(i);
                            }}
                        />

                        {#if creating !== i}
                            <!-- label: family + error -->
                            <g class="label" transform={`translate(${lx}, ${ly}) scale(${1 / zoom})`}>
                                <rect x="-19" y="-9" width="38" height="18" rx="4" style:fill={forced ? color : '#000000aa'} />
                                <text x="-13" y="4" class="label-family" style:fill={forced ? 'black' : color}>{family.toUpperCase()}</text>
                                <text x="-2" y="4" class="label-error" style:fill={forced ? 'black' : errorColor(err)}>
                                    {err !== undefined ? err.toFixed(1) + '°' : ''}
                                </text>
                            </g>

                            <!-- delete button -->
                            <!-- svelte-ignore a11y_click_events_have_key_events -->
                            <g
                                class="delete"
                                transform={`translate(${dx}, ${dy}) scale(${1 / zoom})`}
                                onclick={(e) => {
                                    e.stopPropagation();
                                    removeSegment(i);
                                }}
                                onpointerdown={(e) => e.stopPropagation()}
                            >
                                <circle r="7" />
                                <text y="3.5">×</text>
                            </g>
                        {/if}
                    </g>
                {/each}
            </svg>
        {/if}

        {#each segments as seg, i (seg)}
            {#if creating !== i}
                <Point bind:p={segments[i].p} color={COLORS[families[i] || 'h']} {zoom} onPress={() => (selectedIndex = i)} />
                <Point bind:p={segments[i].q} color={COLORS[families[i] || 'h']} {zoom} onPress={() => (selectedIndex = i)} />
            {/if}
        {/each}

        {#if cropBox && w && h}
            <Point color="cyan" shape="square" p={avg(cropBox[3], cropBox[0])} onMove={(point, dx, dy) => onCropBoxChange({ quadrant: 'left', dx, dy, point })} />
            <Point color="cyan" shape="square" p={avg(cropBox[0], cropBox[1])} onMove={(point, dx, dy) => onCropBoxChange({ quadrant: 'top', dx, dy, point })} />
            <Point color="cyan" shape="square" p={avg(cropBox[1], cropBox[2])} onMove={(point, dx, dy) => onCropBoxChange({ quadrant: 'right', dx, dy, point })} />
            <Point color="cyan" shape="square" p={avg(cropBox[2], cropBox[3])} onMove={(point, dx, dy) => onCropBoxChange({ quadrant: 'bottom', dx, dy, point })} />
        {/if}

        <img crossorigin="anonymous" {src} onload={imgLoaded} bind:this={imgElem} width={imgW} height={imgH} alt="Source" draggable="false" />
    </div>

    {#if segments.length === 0}
        <div class="hint">
            <div class="badge bg-dark fs-6 fw-normal text-wrap">
                Drag on the image to draw segments along lines that should end up <b>horizontal</b> or <b>vertical</b>.
                Click a segment to select it, click again to force its orientation, <kbd>Del</kbd> to delete it.
            </div>
        </div>
    {/if}

    {#if baseZoom !== 1}
        <span class="position-absolute mb-1 end-50 bottom-0">
            <Btn icon={baseZoom > 1 ? 'arrows-collapse' : 'arrows-expand'} onclick={resetZoom}>
                {Math.round(baseZoom * 100)}%
            </Btn>
        </span>
    {/if}
</div>

<style>
    div.outer {
        width: 100%;
        height: 100%;
        position: relative;
        display: inline-block;
        overflow: hidden;
        transform: scale(1); /* Needed due to weird clipping bug */
    }

    .viewport {
        display: inline-block;
        position: absolute;
        left: 0;
        top: 0;
        cursor: crosshair;
    }

    .viewport.creating {
        cursor: crosshair;
    }

    /* Endpoint handles: smaller than the corner control points of the other tabs */
    .viewport :global(.dot.shape-aim) {
        --size: 14px;
        border-width: 1.5px;
    }

    div.moving {
        border: dashed 3px black;
        border-radius: 20px;
    }

    .wireframe {
        position: absolute;
        height: 100%;
        width: 100%;
        overflow: visible;
        z-index: 3;
        pointer-events: none;
        user-select: none;
    }

    /* Stroke widths are divided by the CSS zoom of the viewport so lines stay thin when zoomed in
       (vector-effect="non-scaling-stroke" does not compensate CSS zoom) */
    .segment .line-shadow {
        stroke: rgba(0, 0, 0, 0.6);
        stroke-width: calc(2px * var(--inv-zoom, 1));
    }

    .segment .line {
        stroke-width: calc(1px * var(--inv-zoom, 1));
    }

    .segment .hit {
        stroke: transparent;
        stroke-width: calc(12px * var(--inv-zoom, 1));
        pointer-events: stroke;
        cursor: pointer;
    }

    .segment.hovered .line {
        stroke-width: calc(1.5px * var(--inv-zoom, 1));
    }

    .segment.selected .line-shadow {
        stroke: rgba(255, 255, 255, 0.95);
        stroke-width: calc(3.5px * var(--inv-zoom, 1));
    }

    .segment.selected .line {
        stroke-width: calc(1.5px * var(--inv-zoom, 1));
    }

    .segment .label {
        pointer-events: none;
        font-family: monospace;
        font-size: 11px;
    }

    .segment .label-family {
        font-weight: bold;
    }

    .segment .delete {
        pointer-events: all;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s;
    }

    .segment.hovered .delete {
        opacity: 1;
    }

    .segment .delete circle {
        fill: #ff4d4d;
        stroke: white;
        stroke-width: 1px;
    }

    .segment .delete text {
        fill: white;
        font-size: 12px;
        font-weight: bold;
        text-anchor: middle;
        font-family: sans-serif;
    }

    .hint {
        position: absolute;
        bottom: 12px;
        left: 0;
        right: 0;
        text-align: center;
        pointer-events: none;
        padding: 0 20px;
    }

    img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        user-select: none;
        -webkit-user-drag: none;
        box-shadow:
            0 0 4px 4px rgba(0, 0, 0, 0.2),
            0px 0px 1px 0px rgba(0, 0, 0, 0.5);
        border-radius: 2px;
    }
</style>
