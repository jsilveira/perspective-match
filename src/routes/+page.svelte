<script>
  import PerspT from '$lib/image-logic/PerspT.js';
  import Pic from './Pic.svelte';
  import {load, save} from './storage.js';
  import _ from "lodash";
  import ImageInput from "$lib/components/ImageInput.svelte";
  import {onDestroy} from "svelte";
  import Btn from "$lib/components/Btn.svelte";
  import Point from "./Point.svelte";

  const distance = ([x, y], [x2, y2]) => Math.sqrt((x - x2) ** 2 + (y - y2) ** 2)

  const worker = new Worker(new URL('./perspectiveWorker.js', import.meta.url))

  onDestroy(() => worker.terminate());

  let samples = ["/tire-pressure-label-sample.jpg",]

  let imgA = load("sourceImg", samples[0]);
  let fullImg, error;

  let a, b, c, d;
  let cropA, cropB, cropC, cropD;
  let cropTop = 0, cropBottom = 0, cropLeft = 0, cropRight = 0;
  let w, h;


  let fromX, toX, fromY, toY, destWidth, destHeight;

  let resolution = 1;
  let forceResolution = null;
  let transformEntireImage = false;

  let transformationMatrix, canvasPerspective, lastCanvas, canvasOrigin, srcData;

  let useCssMatrix3D = false;

  let offscreenCanvas, lastSourceData;
  let workerBusy = false;
  let updatePending = false;

  function updateControlPoints(a, b, c, d) {
    if (fullImg && (canvasPerspective || useCssMatrix3D)) {
      save("sourcePoint" + imgA, [a, b, c, d])
      let srcWidth = fullImg.width;
      let srcHeight = fullImg.height;

      // Transformation points
      let [p1, p2, p3, p4] = [a, b, c, d].map(([x, y]) => [x * srcWidth, y * srcHeight]);

      // Compute an approximate size for the rectangle
      let selWidth = Math.round((distance(p1, p2) + distance(p3, p4)) / 2);
      let selHeight = Math.round((distance(p2, p3) + distance(p4, p1)) / 2);

      // Compute the transformation to turn the selection into the aproximate rectangle of that size
      let dstCorners = [...[0, 0], ...[selWidth, 0], ...[selWidth, selHeight], ...[0, selHeight]]
      let perspectiveTransform = new PerspT([...p1, ...p2, ...p3, ...p4], dstCorners);
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

      destWidth = toX - fromX;
      destHeight = toY - fromY;

      fromX -= destWidth * cropLeft;
      toX += destWidth * cropRight;

      fromY -= destHeight * cropTop;
      toY += destHeight * cropBottom;

      destWidth = toX - fromX;
      destHeight = toY - fromY;

      [cropA, cropB, cropC, cropD] = [[fromX, fromY], [toX, fromY], [toX, toY], [fromX, toY]].map(([x, y]) => {
        let [newX, newY] = perspectiveTransform.transformInverse(x, y);
        return [newX/srcWidth, newY/srcHeight]
      });

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


      // if (useCssMatrix3D) {
      //   matrix = computeMatrix3DCss(perspectiveTransform.coeffsInv, perspectiveTransform.coeffs);
      // } else {
        updateNewPerspective();
      // }
    }
  }

  function updateImage(url) {
    if (url && !url?.startsWith('blob:')) {
      save("sourceImg", imgA);
    }

    error = null;
    fullImg = null;

    let image = new Image();
    if (!useCssMatrix3D) {
      image.crossOrigin = "anonymous";
    }
    image.onload = function () {
      fullImg = image;

      ([a, b, c, d] = load("sourcePoint" + imgA, [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]));

      if (!useCssMatrix3D) {
        const resolutionMultiplier = image.width > 1500 ? 2 : 4; // Instead of implementing bilinear filtering, we duplicate resolution of original image
        canvasOrigin = document.createElement('canvas');
        canvasOrigin.width = parseInt(image.width) * resolutionMultiplier;
        canvasOrigin.height = parseInt(image.height) * resolutionMultiplier;
        canvasOrigin.getContext('2d').drawImage(image, 0, 0, canvasOrigin.width, canvasOrigin.height);
        let srcCtx = canvasOrigin.getContext('2d');
        srcData = srcCtx.getImageData(0, 0, canvasOrigin.width, canvasOrigin.height);
      }

      updateControlPoints(a, b, c, d);
    }
    image.onerror = () => {
      error = `Hubo un problema cargando "${imgA}"`;
    }
    image.src = imgA;
  }


  worker.onmessage = (e) => {
    // e.data;
    if (e.data?.message === 'done') {
      workerBusy = false;
      error = null;
      if (updatePending) {
        updatePending = false;
        updateNewPerspective();
      }
    } else if (e.data?.message === 'error') {
      workerBusy = false;
      console.error(e.data.description);
      error = e.data.description;
    } else {
      console.log("Message received from worker", e.data);
    }
  };

  $: updateControlPoints(a, b, c, d) + resolution + forceResolution + transformEntireImage;

  $: updateImage(imgA);

  const updateNewPerspective = _.debounce(() => {
    // if (workerBusy) {
    //   updatePending = true;
    // } else {
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
        ratio: canvasOrigin.height / fullImg.height
      };

      if (lastSourceData !== srcData) {
        messageData.data = srcData;
        lastSourceData = srcData;
        // console.warn("Sending source data")
      }

      if (!offscreenCanvas || canvasPerspective !== lastCanvas) {
        lastCanvas = canvasPerspective;
        offscreenCanvas = canvasPerspective.transferControlToOffscreen();
        messageData.canvas = offscreenCanvas;
        worker.postMessage(messageData, [offscreenCanvas])
        console.warn("New offscreen canvas")
      } else {
        worker.postMessage(messageData)
      }
    // }
  }, 3);

  function rotate() {
    ([a, b, c, d] = [d, a, b, c]);
    ([cropLeft, cropTop, cropRight, cropBottom] = [cropBottom, cropLeft, cropTop, cropRight]);
  }

  function restart() {
    ([cropTop, cropBottom, cropLeft, cropRight] = [0,0,0,0]);
    ([a, b, c, d] = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]])
  }

</script>

<svelte:head>
    <title>Perspective match</title>
</svelte:head>

<ImageInput onImageChange={(dataUri)=>imgA = dataUri}/>
<div class="grid">
    <div class="bar bg-dark text-white gap-3">

        <!--        Url:&nbsp;<input class="url form-control flex-grow-0" type='text' bind:value={imgA}>-->

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
                <input class="form-check-input" type="checkbox" role="switch" id="fullImg"
                       bind:checked={transformEntireImage}>
                <label class="form-check-label" for="fullImg">Entire image</label>
            </div>


            <div class="spinner-border" role="status" style:opacity={workerBusy || updatePending ? 1 : 0}>
                <span class="visually-hidden">Loading...</span>
            </div>
        </div>
    </div>

    <div class="input-cell">
        {#if imgA}
            {#if fullImg}
                <div class="resbadge">
                    <span class="badge bg-dark mr-2">{fullImg.width}x{fullImg.height}</span>
                </div>

                <Pic src={imgA} bind:a bind:b bind:c bind:d bind:w bind:h>
                    {#if w && h}
                        <svg class="wireframe" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">

                            <g fill-rule="evenodd" fill="#00000077">
                                <path d={`M 0,0 L 0,${h} ${w},${h} ${w},0 z M ${a[0]*w},${a[1]*h} L ${[b,c,d].map(([x,y])=> (x*w)+','+(y*h)).join('  ')} z`}/>
                            </g>

                            {#if !transformEntireImage && cropA && (cropBottom ||cropTop || cropLeft || cropRight)}
                                <polygon points={[cropA,cropB,cropC,cropD].map(([x,y])=> (x*w)+','+(y*h)).join('  ')}
                                         style="fill: none; stroke-width: 0.5px; stroke-dasharray: 5; stroke: cyan"/>
                            {/if}

                            <polygon points={[a,b,c,d].map(([x,y])=> (x*w)+','+(y*h)).join('  ')}
                                     style="fill: none; stroke-width: 0.5px; stroke: #0d6efd"/>
                        </svg>

                        {#if !transformEntireImage && cropA}
                            <Point color="cyan" shape="square" p={[(cropD[0]+cropA[0])/2, (cropD[1]+cropA[1])/2]} onMove={(p, movX, movY) => {
                              cropLeft -= movX+movY;
                              updateControlPoints(a,b,c,d);
                              return p
                            }}/>

                            <Point color="cyan" shape="square" p={[(cropA[0]+cropB[0])/2, (cropA[1]+cropB[1])/2]} onMove={(p, movX, movY) => {
                              cropTop -= movX+movY;
                              updateControlPoints(a,b,c,d);
                              return p
                            }}/>

                            <Point color="cyan" shape="square" p={[(cropB[0]+cropC[0])/2, (cropB[1]+cropC[1])/2]} onMove={(p, movX, movY) => {
                              cropRight += movX+movY;
                              updateControlPoints(a,b,c,d);
                              return p
                            }}/>

                            <Point  color="cyan" shape="square" p={[(cropC[0]+cropD[0])/2, (cropC[1]+cropD[1])/2]} onMove={(p, movX, movY) => {
                              cropBottom += movX+movY;
                              updateControlPoints(a,b,c,d);
                              return p
                            }}/>
                        {/if}
                    {/if}
                </Pic>
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

    <div class="output-cell">
        {#if error}
            <div class="alert alert-danger position-absolute" style="z-index: 2;">{error}</div>
        {/if}

        {#if useCssMatrix3D}
            <!--            <div class="css-preview" style:width={destWidth+'px'} style:height={destHeight+'px'}>-->
            <!--                <img src={imgA} style:width={width+'px'} alt="-" class="preview" style:transform={matrix}-->
            <!--                     style:opacity={prevOpacity}/>-->
            <!--            </div>-->
        {:else if fullImg && imgA}
            <div class="resbadge">
                <span class="badge bg-dark"> {Math.round(destWidth)}x{Math.round(destHeight)}</span>
            </div>

            <div class="canvas-preview">
                <canvas bind:this={canvasPerspective}></canvas>
            </div>
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

    .wireframe {
        position: absolute;
        height: 100%;
        width: 100%;
        overflow: visible;
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

    .input-cell {
        background: #FFFFFFEE;
        display: flex;
        justify-content: center;
        padding-top: 10px;
        position: relative;
        user-select: none;
    }

    .input-cell, .output-cell {
        height: 100%;
        width: 100%;
    }

    .css-preview {
        overflow: hidden;
        box-shadow: 0 0 1px 1px black;
    }

    .canvas-preview {
        position: relative;
        height: 100%;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .canvas-preview canvas {
        box-shadow: 0 0 4px 4px rgba(0, 0, 0, 0.2), 0px 0px 1px 0px rgba(0, 0, 0, 0.5);
        border-radius: 2px;
        position: relative;
        max-height: 100%;
        max-width: 100%;
    }

    input.url {
        font-size: 12px;
        width: 100%;
    }

    .preview {
        position: relative;
        /*mix-blend-mode: difference;*/
        left: 0;
        top: 0;
        transform-origin: top left;
    }
</style>
