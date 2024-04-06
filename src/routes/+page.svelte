<script>
  import _ from 'lodash';
  import {onDestroy} from "svelte";

  import {load, save} from './storage.js';
  import {distance} from "$lib/image-logic/geometry.js"

  import PerspT from '$lib/image-logic/PerspT.js';
  import Btn from "$lib/components/common/Btn.svelte";
  import PicWithPoints from "$lib/components/perspective/PicWithPoints.svelte";
  import Icon from "$lib/components/common/Icon.svelte";
  import ImageInput from "$lib/components/common/ImageInput.svelte";
  import LetterCircle from "$lib/components/perspective/LetterCircle.svelte";

  /**
   * @typedef {import('$lib/image-logic/geometry.js').Point}
   */

  const MODE_A_TO_B = 'a_to_b';
  const MODE_STRAIGHTEN_A = 'a_straighten';

  const worker = new Worker(new URL('./perspectiveWorker.js', import.meta.url))
  onDestroy(() => worker.terminate());

  let mode = MODE_STRAIGHTEN_A;

  let samples = ["/fuses-1.jpg", "/fuses-2.jpg", "/tire-pressure-label-sample.jpg","/tire-pressure-label-sample-2.jpg"]
  let imgSrcA = load("sourceImg", samples[2]);
  let imgSrcB = load("destImg", samples[3]);

  /** @type {null | HTMLImageElement} */
  let imageA;
  /** @type {null | HTMLImageElement} */
  let imageB;

  /** @type {null | string} */
  let error;

  /** @type Point[] */
  let boxA;
  /** @type Point[] */
  let boxB;
  /** @type Point[] | null */
  let cropBox;
  /** @type Bounds */
  let cropBounds = {left: 0, right: 0, top: 0, bottom: 0};

  $: hasCropBox = _.some(_.values(cropBounds));

  let fromX, toX, fromY, toY, destWidth, destHeight;

  let resolution = 1;
  /** @type number | null*/
  let forceResolution = null;

  let transformEntireImage = false;

  let transformationMatrix, canvasPerspective, lastCanvas, canvasOrigin, srcData;

  let offscreenCanvas, lastSourceData;
  let workerBusy = false;
  let updatePending = false;

  /** @type PerspT */
  let perspectiveTransform;

  function updateSourceControlPoints() {
    if (imageA && canvasPerspective) {
      save("sourcePoint" + imgSrcA, boxA)

      let srcWidth = imageA.width;
      let srcHeight = imageA.height;

      // Transformation points
      let [p1, p2, p3, p4] = boxA.map(([x, y]) => [x * srcWidth, y * srcHeight]);

      // Compute an approximate size for the rectangle
      let selWidth = Math.round((distance(p1, p2) + distance(p3, p4)) / 2);
      let selHeight = Math.round((distance(p2, p3) + distance(p4, p1)) / 2);

      // Compute the transformation to turn the selection into the aproximate rectangle of that size
      let dstCorners = [...[0, 0], ...[selWidth, 0], ...[selWidth, selHeight], ...[0, selHeight]]

      if (mode === MODE_A_TO_B && boxB && imageB) {
        save("destPoint" + imgSrcB, boxB)
        dstCorners = _.flatten(boxB.map(([x, y]) => [x * imageB.width, y * imageB.height]));
      }

      perspectiveTransform = new PerspT([...p1, ...p2, ...p3, ...p4], dstCorners);
      transformationMatrix = perspectiveTransform.coeffsInv;

      if(mode === MODE_A_TO_B && boxB && imageB) {
        fromX = 0
        fromY = 0
        toX = imageB.width;
        toY = imageB.height;
      } else {
        let newCorners;

        if (transformEntireImage) {
          newCorners = [[0, 0], [srcWidth, 0], [srcWidth, srcHeight], [0, srcHeight]].map(([x, y]) => perspectiveTransform.transform(x, y))
        } else {
          newCorners = [p1, p2, p3, p4].map(([x, y]) => perspectiveTransform.transform(x, y))
        }

        fromX = Math.min(...newCorners.map(p => p[0]));
        toX = Math.max(...newCorners.map(p => p[0]));
        fromY = Math.min(...newCorners.map(p => p[1]));
        toY = Math.max(...newCorners.map(p => p[1]));

        destWidth = toX - fromX;
        destHeight = toY - fromY;

        if(!transformEntireImage) {
          fromX -= destWidth * cropBounds.left;
          toX += destWidth * cropBounds.right;

          fromY -= destHeight * cropBounds.top;
          toY += destHeight * cropBounds.bottom;
        }
      }

      destWidth = toX - fromX;
      destHeight = toY - fromY;

      if(transformEntireImage || mode === MODE_A_TO_B) {
        cropBox = null;
      } else {
        cropBox = [[fromX, fromY], [toX, fromY], [toX, toY], [fromX, toY]].map(([x, y]) => {
          let [newX, newY] = perspectiveTransform.transformInverse(x, y);
          return [newX / srcWidth, newY / srcHeight]
        });
      }

      // console.log(cropA, cropB, cropC, cropD);

      if (forceResolution) {
        resolution = forceResolution;
      } else {
        if (destHeight > 2400 || destWidth > 2400) {
          resolution = 0.5
        } else {
          resolution = 1
        }
      }

      destWidth = destWidth * resolution;
      destHeight = destHeight * resolution;

      computeOutputNewPerspective();
    }
  }

  function onCropBoxChange({quadrant, point, dx, dy}) {
    let [ncX, ncY] = perspectiveTransform.transform((point[0]+dx)*imageA.width, (point[1]+dy)*imageA.height);

    ncX = ncX*resolution;
    ncY = ncY*resolution;

    let {left, right, top, bottom} = cropBounds;
    console.log(`CROP BOX CHANGE ${destWidth.toFixed(1)}x${destHeight.toFixed(1)}`, quadrant, dx.toFixed(3),dy.toFixed(3));

    switch (quadrant){
      case 'left':
        cropBounds.left = Math.max(-0.9999-right,  (-ncX)/(destWidth/(1+right+left)));
        break;
      case 'top':
        cropBounds.top = Math.max(-0.9999-bottom,  (-ncY)/(destHeight/(1+bottom+top)));
        break;
      case 'right':
        cropBounds.right = Math.max(-0.9999-left,  (ncX)/(destWidth/(1+right+left)) - 1);
        break;
      case 'bottom':
        cropBounds.bottom = Math.max(-0.9999-top,  (ncY)/(destHeight/(1+bottom+top)) - 1)
        break;
    }

    console.log(cropBounds)

    updateSourceControlPoints();
  }


  function updateOriginCanvas(img) {
    const resolutionMultiplier = img.width > 1500 ? 2 : 4;
    // const resolutionMultiplier = 1;
    canvasOrigin = document.createElement('canvas');
    canvasOrigin.width = img.width * resolutionMultiplier;
    canvasOrigin.height = img.height * resolutionMultiplier;
    console.time(`Compute source data at ${canvasOrigin.width}x${canvasOrigin.height}`)
    canvasOrigin.getContext('2d').drawImage(img, 0, 0, canvasOrigin.width, canvasOrigin.height);
    srcData = canvasOrigin.getContext('2d').getImageData(0, 0, canvasOrigin.width, canvasOrigin.height);
    console.timeEnd(`Compute source data at ${canvasOrigin.width}x${canvasOrigin.height}`)
  }

  async function updateImage(url, localStorageId) {
    if (url && !url?.startsWith('blob:') && localStorageId) {
      save(localStorageId, imgSrcA);
    }

    error = null;

    return new Promise((resolve, reject) => {
      let image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = function () {
        // Instead of implementing bilinear filtering, we duplicate resolution of original image
        if(localStorageId === 'sourcePoint') {
          updateOriginCanvas(image);
        }
        resolve(image);
      }
      image.onerror = () => error = `Hubo un problema cargando "${imgSrcA}"`
      image.src = url;
    })
  }

  worker.onmessage = (e) => {
    // e.data;
    if (e.data?.message === 'done') {
      workerBusy = false;
      error = null;
      if (updatePending) {
        updatePending = false;
        computeOutputNewPerspective();
      }
    } else if (e.data?.message === 'error') {
      workerBusy = false;
      console.error(e.data.description);
      error = e.data.description;
    } else {
      console.log("Message received from worker", e.data);
    }
  };

  $: updateSourceControlPoints(boxA, resolution, forceResolution, transformEntireImage, boxB, cropBounds, imageA, imageB, mode);


  function afterLoadA(image) {
    boxA = boxA || load("sourcePoint" + imgSrcA, [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]);
    imageA = image;
  }

  function afterLoadB(image) {
      boxB = boxB || load("destPoint" + imgSrcB, [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]);
      imageB = image;
  }

  $: imgSrcA && updateImage(imgSrcA, 'sourcePoint').then(afterLoadA);
  $: imgSrcB && updateImage(imgSrcB, 'destPoint').then(afterLoadB);

  const computeOutputNewPerspective = _.debounce(() => {
      workerBusy = true;

      let messageData = {
        srcH: canvasOrigin.height,
        srcW: canvasOrigin.width,
        fromX,
        fromY,
        toX,
        toY,
        resolution,
        transformationMatrix,
        ratio: canvasOrigin.height / imageA.height
      };

      // Only send heavy source image data if it changed
      if (lastSourceData !== srcData) {
        messageData.data = srcData;
        lastSourceData = srcData;
      }

      if (!offscreenCanvas || canvasPerspective !== lastCanvas) {
        console.time("New offscreen canvas")
        lastCanvas = canvasPerspective;
        offscreenCanvas = canvasPerspective.transferControlToOffscreen();
        messageData.canvas = offscreenCanvas;
        worker.postMessage(messageData, [offscreenCanvas])
        console.timeEnd("New offscreen canvas")
        // console.warn("New offscreen canvas", messageData)
      } else {
        // console.warn("Worker request", messageData)
        worker.postMessage(messageData)
      }
  }, 3);

  function rotate() {
    let [a, b, c, d] = boxA;
    boxA = [d, a, b, c];
    let {left, right, top, bottom} = cropBounds;
    cropBounds = {left: bottom, top: left, right: top, bottom: right};
  }

  function restart() {
    boxA = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]];
    resetCrop()
  }

  function resetCrop() {
    cropBounds = {left: 0, right: 0, top: 0, bottom: 0};
  }

  function swap() {
    [imageA, imageB] = [null, null];
    [imgSrcA, imgSrcB] = [imgSrcB, imgSrcA];
    [boxA, boxB] = [boxB, boxA]
    // updateOriginCanvas(imageA);
  }

  let imgBOpacity = 0.5;
  function controlOpacity(e) {
    if(imageB) {
      imgBOpacity = e.offsetX/e.currentTarget.clientWidth;
    }
  }
</script>

<svelte:head>
    <title>Perspective match</title>
</svelte:head>


<div class="grid" class:grid-3={mode === MODE_A_TO_B}>
  <div class="bg-purple tabs d-flex justify-content-evenly align-items-end">
    <div class="fs-3 mb-1" style="min-width: 50px">
      <LetterCircle --back-color="var(--img-a)">A</LetterCircle>
    </div>

    <div class="center">
      <ul class="nav nav-tabs">
        <li class="nav-item">
          <a class="nav-link" class:active-tab={mode == MODE_STRAIGHTEN_A}  on:click={() => mode = MODE_STRAIGHTEN_A}  href="javascript:void(0)">
            Straighten <LetterCircle --back-color="var(--img-a)">A</LetterCircle>
            <img src="/icon-img-a.png"  height="24" width="24" alt="A"/>
            <Icon icon="arrow-right"/>
            <img src="/icon-img-a-flat.png"  height="24" width="24" alt="B"/>
          </a>
        </li>

        <li class="nav-item">
          <a class="nav-link" class:active-tab={mode == MODE_A_TO_B} aria-current="page" on:click={() => mode = MODE_A_TO_B} href="javascript:void(0)">
            Match perspective of
            <LetterCircle --back-color="var(--img-a)">A</LetterCircle> with  <LetterCircle --back-color="var(--img-b)">B</LetterCircle>
            <img src="/icon-img-a.png"  height="24" width="24" alt="A"/>
            <Icon icon="arrow-right"/>
            <img src="/icon-img-b.png"  height="24" width="24" alt="B"/>
          </a>
        </li>

      </ul>
    </div>

    <div class="fs-3 mb-1" style="min-width: 50px">
      {#if mode === MODE_A_TO_B}
        <LetterCircle --back-color="var(--img-b)">B</LetterCircle>
      {/if}
    </div>
  </div>


    <div class="bar bg-dark text-white gap-3">
        <Btn on:click={restart} icon="bounding-box-circles">Reset control points</Btn>

        {#if cropBox && hasCropBox}
          <Btn on:click={resetCrop} icon="textarea">Reset crop box</Btn>
        {/if}
    </div>

    <div class="bar bg-dark text-white">
        <div class="d-flex align-items-center gap-3">
            <Btn icon="arrow-clockwise" on:click={rotate}>Rotate</Btn>

            <div class="btn-group" role="group" aria-label="Basic radio toggle button group">
                {#each [0.5, 1, 2, 4] as res}
                    <input type="radio" class="btn-check" name="btnradio" id={"btnradio"+res} autocomplete="off"
                           on:click={()=> forceResolution = (forceResolution === res ? null : res)}
                           checked={resolution == res}>
                    <label class={"btn btn-sm btn-outline-"+(forceResolution ? 'primary' : 'secondary')}
                           for={"btnradio"+res}>{res}X</label>
                {/each}
            </div>

            {#if mode === MODE_STRAIGHTEN_A}
              <div class="form-check form-switch mb-0">
                  <input class="form-check-input" type="checkbox" role="switch" id="imageA"
                         bind:checked={transformEntireImage}>
                    <label class="form-check-label" for="imageA">Entire image</label>
              </div>
            {/if}

          <span>
            <span class="spinner-border" role="status" style:opacity={workerBusy || updatePending ? 1 : 0}>
                <span class="visually-hidden">Loading...</span>
            </span>
          </span>
        </div>
    </div>

    {#if mode == MODE_A_TO_B}
        <div class="bar bg-dark text-white">
          <Btn icon="arrow-left-right" on:click={swap}>Swap images</Btn>
        </div>
    {/if}


    <div class="input-cell">
      <ImageInput bind:src={imgSrcA}/>

      {#if imgSrcA}
          {#if imageA}
              <div class="resbadge">
                  <span class="badge bg-dark mr-2">{imageA.width}x{imageA.height}</span>
              </div>

              <PicWithPoints bind:box={boxA} bind:cropBox hideCropBox={!hasCropBox} {onCropBoxChange} src={imgSrcA}/>
          {:else if error}
              <div class="alert alert-danger m-4">
                  {error}
              </div>
          {:else}
              <h3>Loading...</h3>
          {/if}
      {/if}
    </div>


    <div class="output-cell" on:mousemove={controlOpacity} on:mouseleave={() => imgBOpacity = 0.5}>
        {#if error}
            <div class="alert alert-danger position-absolute" style="z-index: 2;">{error}</div>
        {/if}

        {#if imageA }
            <div class="resbadge">
                <span class="badge bg-dark"> {Math.round(destWidth)}x{Math.round(destHeight)}</span>
            </div>

            <div class="canvas-preview">
              {#if mode === MODE_A_TO_B && imageB && boxB}
                <img src={imgSrcB} class="imgSrcB"/>
                <canvas  style:opacity={imgBOpacity} bind:this={canvasPerspective}></canvas>
              {:else}
                <canvas bind:this={canvasPerspective}></canvas>
              {/if}
            </div>
        {/if}
    </div>

  {#if mode === MODE_A_TO_B}
      <div class="second-input-cell">
        <ImageInput bind:src={imgSrcB} paste={false}/>

        {#if false}
          <div class="alert alert-danger position-absolute" style="z-index: 2;">{error}</div>
        {/if}

        {#if imgSrcB}
          {#if imageB && boxB}
            <div class="resbadge">
              <span class="badge bg-dark mr-2">{imageB.width}x{imageB.height}</span>
            </div>

            <PicWithPoints bind:box={boxB} src={imgSrcB}/>
          {:else}
            <h3>Loading...</h3>
          {/if}
        {/if}
      </div>
    {/if}
</div>


<style lang="css">
    :root {
        --img-a: #8b38f6;
        --img-b: #f92967;
    }

    .grid {
        position: fixed;
        height: 100%;
        width: 100%;
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 50px 50px 1fr;
        grid-column-gap: 0px;
        grid-row-gap: 0px;

        background: url('/checkered.png');
        background-size: 100px;
        background-color: white;
    }

    .grid-3 {
        grid-template-columns: 1fr 1fr 1fr;
    }


    .grid .tabs {
        grid-column-start: 1;
        grid-column-end: 3;
    }

    .grid.grid-3 .tabs {
        grid-column-start: 1;
        grid-column-end: 4;
    }


    .resbadge {
        position: absolute;
        top: 2px;
        text-align: center;
        left: calc(50% - 150px);
        width: 300px;
        user-select: none;
    }

    .bar {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 20px;
    }

    .output-cell {
        background: #FFFFFFEE;
        vertical-align: middle;
        text-align: center;
        padding: 30px 10px 10px 10px;
        border-left: solid 2px black;
        overflow: auto;
        position: relative;
        user-select: none;
    }

    .input-cell, .second-input-cell {
        background: #FFFFFFEE;
        display: flex;
        justify-content: center;
        align-items: center;
        padding-top: 20px;
        position: relative;
        user-select: none;
    }

    .input-cell, .output-cell, .second-input-cell {
        height: 100%;
        width: 100%;
    }

    .second-input-cell {
        border-left: solid 2px black;
    }

    .canvas-preview {
        position: relative;
        height: 100%;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .canvas-preview canvas, .canvas-preview .imgSrcB {
        box-shadow: 0 0 4px 4px rgba(0, 0, 0, 0.2), 0px 0px 1px 0px rgba(0, 0, 0, 0.5);
        border-radius: 2px;
        position: relative;
        max-height: 100%;
        max-width: 100%;
    }

    .canvas-preview canvas {
        /*z-index: 1;*/
        position: absolute;
    }

    .imgSrcB {
        position: absolute;
        /*z-index: 1;*/
        /*transition: opacity 0.1s;*/
    }

    .bg-purple {
        background: #d1c3ea;
    }

    .nav-item .active-tab.nav-link {
        background: #212529;
        border-color: #212529;
        color: white;
    }
    .nav-item .nav-link {
        background: rgba(255,255,255,0.5);
    }
</style>
