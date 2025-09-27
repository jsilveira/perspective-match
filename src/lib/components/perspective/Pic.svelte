<script>
    import Point from './Point.svelte';
    import Btn from '$lib/components/common/Btn.svelte';

    let { src, a = $bindable(), b = $bindable(), c = $bindable(), d = $bindable(), h = $bindable(), w = $bindable(), padding = 10, children } = $props();

    let moving = $state(false);
    const zoomFactor = 4;
    let baseZoom = $state(1);
    let zoom = $derived(moving ? zoomFactor * baseZoom : baseZoom);
    let lastMousePosition = $state([0, 0]);

    let left = $state('0px');
    let top = $state('0px');
    let fixedZoomOffset = $state(false);

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
        baseZoom = baseZoom * (e.deltaY > 0 ? 1 / (1 - e.deltaY / 2000) : 1 + e.deltaY / 2000);
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
        lastMousePosition = [offsetX / rect.width, offsetY / rect.height];

        console.log(e.clientX, rect.width, offsetX);
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
</script>

<svelte:window on:keydown={onKeyDown} on:keyup={onKeyUp} />

<div bind:clientWidth={w} bind:clientHeight={h} class:moving class="outer">
    <div class="viewport" style:width={imgW + 'px'} style:height={imgH + 'px'} style:zoom style:left style:top onmousemove={onMouseMove}>
        {@render children?.()}

        <Point bind:p={a} color={'#89fd0d'} {zoom} />
        <Point bind:p={b} color={'#0de9fd'} {zoom} />
        <Point bind:p={c} color={'#0d6efd'} {zoom} />
        <Point bind:p={d} color={'#fd0db9'} {zoom} />

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
        box-shadow:
            0 0 4px 4px rgba(0, 0, 0, 0.2),
            0px 0px 1px 0px rgba(0, 0, 0, 0.5);
        border-radius: 2px;
    }
</style>
