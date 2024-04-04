<script>
  import Point from './Point.svelte'

  export let src, a, b, c, d, h, w, padding = 20;

  let moving = false;
  const zoomFactor = 4;
  let zoom;
  $: zoom = moving ? zoomFactor : 1;

  let left = 0;
  let top = 0;

  $: if (moving) {
    let [x, y] = moving;
    setTimeout(() => {
      left = (w - imgW)/2/zoomFactor -imgW*(x - (x / zoomFactor))+'px';
      top = (h - imgH)/2/zoomFactor -imgH*(y - y / zoomFactor)+'px';
      // picDiv.scrollTo(toX, toY, 0)
      // console.log("Scrolling", toX, toY)
    })
  } else {
    left = 0;
    top = 0;
  }

  let imgElem, imgH, imgW;
  function imgLoaded() {
    let nW = imgElem.naturalWidth;
    let nH = imgElem.naturalHeight;

    let ratio = w/h;
    let nRatio = nW/nH;

    if (ratio <= nRatio) {
      imgW = (w-2*padding);
      imgH = (w-2*padding)/nRatio;
    } else {
      imgW = nRatio * (h-2*padding);
      imgH = (h-2*padding);
    }

    left = (w - imgW)/2+'px';
    top = (h - imgH)/2+'px';

    // console.log(`${imgW}x${imgH} in context ${w}x${h}`)
  }

  $: imgW && imgLoaded(w,h, src)
</script>

<div
     bind:clientWidth={w}
     bind:clientHeight={h}
     class:moving={moving}
     class="outer"
>
    <div class="viewport" style:width={imgW+'px'} style:height={imgH+'px'} style:zoom style:left style:top>
        <slot/>

        <Point bind:p={a} color={"#89fd0d"} {zoom} bind:moving/>
        <Point bind:p={b} color={"#0de9fd"} {zoom} bind:moving/>
        <Point bind:p={c} color={"#0d6efd"} {zoom} bind:moving/>
        <Point bind:p={d} color={"#fd0db9"} {zoom} bind:moving/>

        <img crossorigin="anonymous" {src} on:load={imgLoaded} bind:this={imgElem} width={imgW} height={imgH} alt='asd'/>
    </div>
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

    .moving :global(.x), .moving :global(.y) {
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
        box-shadow: 0 0 4px 4px rgba(0,0,0,0.2), 0px 0px 1px 0px rgba(0,0,0,0.5);
        border-radius: 2px;
    }
</style>
