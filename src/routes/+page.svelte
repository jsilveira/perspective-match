<script>
  import PerspT from '$lib/image-logic/PerspT.js';
  import {load, save} from './storage.js';
  import _ from 'lodash';
  import ImageInput from "$lib/components/ImageInput.svelte";
  import {onDestroy} from "svelte";
  import Btn from "$lib/components/Btn.svelte";
  import PicWithPoints from "./PicWithPoints.svelte";

  /**
   * @typedef {[number, number]} Point
   * @typedef {{left: number, top: number, bottom: number, right: number}} Bounds
   */

  /**
   * @param {Point} a
   * @param {Point} b
   */
  const distance = ([x, y], [x2, y2]) => Math.sqrt((x - x2) ** 2 + (y - y2) ** 2)

  const worker = new Worker(new URL('./perspectiveWorker.js', import.meta.url))

  onDestroy(() => worker.terminate());

  let samples = ["/fuses-1.jpg", "/fuses-2.jpg", "/tire-pressure-label-sample.jpg",]

  let imgSrcA = load("sourceImg", samples[1]);
  let imgSrcB = load("destImg", samples[0]);

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

      if (boxB && imageB) {
        save("destPoint" + imgSrcB, boxB)
        dstCorners = _.flatten(boxB.map(([x, y]) => [x * imageB.width, y * imageB.height]));

      }

      perspectiveTransform = new PerspT([...p1, ...p2, ...p3, ...p4], dstCorners);
      transformationMatrix = perspectiveTransform.coeffsInv;

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

      if(boxB && imageB) {
        fromX = 0
        fromY = 0
        toX = imageB.width;
        toY = imageB.height;

      }

      destWidth = toX - fromX;
      destHeight = toY - fromY;

      console.log(boxA, boxB, srcWidth, srcHeight, destWidth, destHeight)

      if(!transformEntireImage) {
        fromX -= destWidth * cropBounds.left;
        toX += destWidth * cropBounds.right;

        fromY -= destHeight * cropBounds.top;
        toY += destHeight * cropBounds.bottom;
      }

      destWidth = toX - fromX;
      destHeight = toY - fromY;

      if(transformEntireImage) {
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

    let {left, right, top, bottom} = cropBounds;

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

    updateSourceControlPoints();
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
        let width = image.width;
        let height = image.height;

        const resolutionMultiplier = width > 1500 ? 2 : 4;
        // Instead of implementing bilinear filtering, we duplicate resolution of original image
        if(localStorageId === 'sourcePoint') {
          canvasOrigin = document.createElement('canvas');
          canvasOrigin.width = width * resolutionMultiplier;
          canvasOrigin.height = height * resolutionMultiplier;
          canvasOrigin.getContext('2d').drawImage(image, 0, 0, canvasOrigin.width, canvasOrigin.height);
          srcData = canvasOrigin.getContext('2d').getImageData(0, 0, canvasOrigin.width, canvasOrigin.height);
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

  $: updateSourceControlPoints(boxA, resolution, forceResolution, transformEntireImage, boxB, imageA, imageB);


  function afterLoadA(image) {
    boxA = boxA || load("sourcePoint" + imgSrcA, [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]);
    imageA = image;
  }

  function afterLoadB(image) {
      boxB = boxB || load("destPoint" + imgSrcB, [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]);
      imageB = image;
      // transformEntireImage = true;
  }

  $: updateImage(imgSrcA, 'sourcePoint').then(afterLoadA);
  $: updateImage(imgSrcB, 'destPoint').then(afterLoadB);



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
        lastCanvas = canvasPerspective;
        offscreenCanvas = canvasPerspective.transferControlToOffscreen();
        messageData.canvas = offscreenCanvas;
        worker.postMessage(messageData, [offscreenCanvas])
        console.warn("New offscreen canvas", messageData)
      } else {
        console.warn("Worker request", messageData)
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
    cropBounds = {left: 0, right: 0, top: 0, bottom: 0};
    boxA = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]];
  }

  function swap() {
    [imageA, imageB] = [null, null];
    [imgSrcA, imgSrcB] = [imgSrcB, imgSrcA];
    [boxA, boxB] = [boxB, boxA]
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


<div class="grid" class:grid-3={imgSrcB}>
    <div class="bar bg-dark text-white gap-3">

        <!--        Url:&nbsp;<input class="url form-control flex-grow-0" type='text' bind:value={imgSrcA}>-->

        <Btn on:click={restart} icon="grid">Reset control points</Btn>
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

            <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" role="switch" id="imageA"
                       bind:checked={transformEntireImage}>
                <label class="form-check-label" for="imageA">Entire image</label>
            </div>


            <div class="spinner-border" role="status" style:opacity={workerBusy || updatePending ? 1 : 0}>
                <span class="visually-hidden">Loading...</span>
            </div>
        </div>
    </div>

    {#if imgSrcB}
        <div class="bar bg-dark text-white">
          <Btn icon="arrow-left-right" on:click={swap}>Swap images</Btn>
        </div>
    {/if}


    <div class="input-cell">
      <ImageInput onImageChange={(dataUri)=> imgSrcA = dataUri}/>

      {#if imgSrcA}
          {#if imageA}
              <div class="resbadge">
                  <span class="badge bg-dark mr-2">{imageA.width}x{imageA.height}</span>
              </div>

              <PicWithPoints bind:box={boxA} bind:cropBox {onCropBoxChange} src={imgSrcA}/>
          {:else if error}
              <div class="alert alert-danger m-4">
                  {error}
              </div>
          {:else}
              <h3>Loading...</h3>
          {/if}
      {:else}
          <div class="alert alert-primary m-4">
              Paste an image or enter the rewise url above
          </div>
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
                <canvas bind:this={canvasPerspective}></canvas>

              {#if imageB && boxB}
                <img style:opacity={imgBOpacity} src={imgSrcB} class="imgSrcB"/>
              {/if}
            </div>
        {/if}
    </div>

    <div class="second-input-cell">
      <ImageInput onImageChange={(dataUri)=> imgSrcB = dataUri} paste={false}/>
      {#if false}
          <div class="alert alert-danger position-absolute" style="z-index: 2;">{error}</div>
      {/if}

      {#if imageB && imgSrcB && boxB}
          <div class="resbadge">
              <span class="badge bg-dark mr-2">{imageB.width}x{imageB.height}</span>
          </div>

          <PicWithPoints bind:box={boxB} src={imgSrcB}/>
      {/if}
    </div>
</div>


<style lang="css">
    .grid {
        position: fixed;
        height: 100%;
        width: 100%;
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 50px 1fr;
        grid-column-gap: 0px;
        grid-row-gap: 0px;

        background: url('/checkered.png');
        background-size: 100px;
        background-color: white;
    }

    .grid-3 {
        grid-template-columns: 1fr 1fr 1fr;
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
        padding-top: 10px;
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
        z-index: 1;
        opacity: 0.5;
        transition: opacity 0.1s;
    }
</style>
