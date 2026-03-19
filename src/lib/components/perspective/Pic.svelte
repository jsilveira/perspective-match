<script>
    import Point from './Point.svelte';
    import Btn from '$lib/components/common/Btn.svelte';
    import { sortBy } from 'lodash-es';

    let { src, a = $bindable(), b = $bindable(), c = $bindable(), d = $bindable(), h = $bindable(), w = $bindable(), padding = 10, children } = $props();

    let moving = $state(false);
    const zoomFactor = 4;
    let baseZoom = $state(1);
    let zoom = $derived(moving ? zoomFactor * baseZoom : baseZoom);
    let lastMousePosition = $state([0, 0]);

    let left = $state('0px');
    let top = $state('0px');
    let fixedZoomOffset = $state(false);

    let preselected = $state(null);
    let selected = $state(null);

    $effect(() => {
        if (moving) {
            let z = zoomFactor * baseZoom;
            let [x, y] = lastMousePosition;
            if (!fixedZoomOffset) {
                fixedZoomOffset = true;
                setTimeout(() => {
                    left = (w - imgW) / 2 / z - imgW * (x - x / z) + 'px';
                    top = (h - imgH) / 2 / z - imgH * (y - y / z) + 'px';
                    // picDiv.scrollTo(toX, toY, 0)
                    // console.log("Scrolling", toX, toY)
                });
            }
        } else {
            fixedZoomOffset = false;
            left = (w - imgW) / 2 + 'px';
            top = (h - imgH) / 2 + 'px';
        }
    });

    let imgElem = $state(),
        imgH = $state(),
        imgW = $state();

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

        // console.log(`${imgW}x${imgH} in context ${w}x${h}`)
    }

    function onMouseWheel(e) {
        const delta = -e.deltaY;
        baseZoom = baseZoom * (delta > 0 ? 1 / (1 - delta / 2000) : 1 + delta / 2000);
        if (baseZoom < 1) {
            left = (w - imgW * baseZoom) / 2 / baseZoom + 'px';
            top = (h - imgH * baseZoom) / 2 / baseZoom + 'px';
        } else {
        }
    }

    function resetZoom() {
        baseZoom = 1;
        left = (w - imgW) / 2 + 'px';
        top = (h - imgH) / 2 + 'px';
    }

    $effect(() => {
        if (imgW) imgLoaded(w, h, src);
    });

    function onMouseMove(e) {
        if (!e.shiftKey && moving) {
            moving = false;
        } else if (e.shiftKey && !moving) {
            moving = true;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        const mx = offsetX / rect.width;
        const my = offsetY / rect.height;
        lastMousePosition = [mx, my];

        if (e.target !== imgElem) {
            preselected = null;
        } else {
            const rect = e.currentTarget.getBoundingClientRect();
            const HIT_RADIUS_PX = 4000;
            const hitRadius = HIT_RADIUS_PX / Math.min(rect.width, rect.height);

            let byDistance = sortBy(
                [a, b, c, d].map(p => ({ p, dist: Math.hypot(p[0] - mx, p[1] - my) })),
                'dist'
            );
            preselected = byDistance[0].dist < hitRadius ? byDistance[0].p : null;
        }
        // console.log(e.target);
    }

    function onMouseDown(e) {
        if (preselected && e.button === 0) {
            selected = preselected;
            selected[0] = lastMousePosition[0];
            selected[1] = lastMousePosition[1];
        }
    }

    function onMouseLeave(e) {
        selected = null;
        preselected = null;
    }

    function onMouseUp(e) {
        selected = null;
    }

    function onKeyDown(e) {
        if (e.key === 'Shift') {
            moving = true;
        }
    }

    function onKeyUp(e) {
        if (e.key === 'Shift') {
            moving = false;
        }
    }

    const colors = ['#89fd0d', '#0de9fd', '#0d6efd', '#fd0db9'];
</script>

<svelte:window on:keydown={onKeyDown} on:keyup={onKeyUp} />

<div bind:clientWidth={w} bind:clientHeight={h} class:moving class="outer" onwheel={onMouseWheel}>
    <div
        class="viewport"
        style:width={imgW + 'px'}
        style:height={imgH + 'px'}
        style:zoom
        style:left
        style:top
        onmousemove={onMouseMove}
        onmousedown={onMouseDown}
        onmouseup={onMouseUp}
        onmouseleave={onMouseLeave}
        role="button"
        tabindex="0"
    >
        {@render children?.()}

        <Point bind:p={a} color={colors[0]} {zoom} hovered={preselected === a} selected={selected === a} />
        <Point bind:p={b} color={colors[1]} {zoom} hovered={preselected === b} selected={selected === b} />
        <Point bind:p={c} color={colors[2]} {zoom} hovered={preselected === c} selected={selected === c} />
        <Point bind:p={d} color={colors[3]} {zoom} hovered={preselected === d} selected={selected === d} />

        {#if preselected && w && h}
            {@const box = [a, b, c, d]}
            {@const selIndex = box.indexOf(preselected)}
            <svg class="wireframe" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
                <polyline
                    points={[box[(selIndex - 1 + box.length) % box.length], lastMousePosition, box[(selIndex + 1) % box.length]]
                        .map(([x, y]) => x * w + ',' + y * h)
                        .join('  ')}
                    vector-effect="non-scaling-stroke"
                    style={"fill: none; stroke-width: 0.5px; stroke: "+colors[selIndex]}
                />
            </svg>
        {/if}

        <img crossorigin="anonymous" {src} onload={imgLoaded} bind:this={imgElem} width={imgW} height={imgH} alt="asd" />
    </div>

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
    }

    div.moving {
        /*border-radius: 20px;*/
        border: dashed 3px black;
        border-radius: 20px;
    }

    .moving :global(.x),
    .moving :global(.y) {
        border-width: 0.25px;
    }

    .wireframe {
        position: absolute;
        height: 100%;
        width: 100%;
        overflow: visible;
        z-index: 1000;
        pointer-events: none;
        user-select: none;
    }

    img {
        /*width: 60px;*/
        width: 100%;
        height: 100%;
        /*height: 500px;*/
        object-fit: contain;
        -webkit-user-select: none;
        -khtml-user-select: none;
        -moz-user-select: none;
        -o-user-select: none;
        user-select: none;
        user-drag: none;
        box-shadow:
            0 0 4px 4px rgba(0, 0, 0, 0.2),
            0px 0px 1px 0px rgba(0, 0, 0, 0.5);
        border-radius: 2px;
    }
</style>
