let offscreenCanvas;
let sourceData;
let activeComputationId, activeComputationPromise;

// if (window.Worker) {
onmessage = async (e) => {
  let data = e.data;
  // console.log("Message received from main script",  destWidth, destHeight, srcH, srcW, ratio);

    let myComputationId = Math.random();
    activeComputationId = myComputationId;

    // Wait any previous computation
    if (activeComputationPromise) {
      console.log("%cAwaiting prev computation...", "color: gray")
      await activeComputationPromise;
      if(activeComputationId !== myComputationId) {
        console.log("%cObsolete call already.", "color: red")
        return;
      }
    }

    if (data.canvas) {
      offscreenCanvas = data.canvas;
    }

    if (data.data) {
      sourceData = data.data;
    }

  try {
    console.time("Worker perspective computation")

    activeComputationPromise = transformCanvas(activeComputationId, {
      ...data,
      srcData: sourceData,
      destCanvas: offscreenCanvas
    });

    const interrupted = await activeComputationPromise;

    if (!interrupted) {
      postMessage({message: 'done'});
      activeComputationPromise = null;
    } else {
      console.log("%cAborted computation.", "color: red")
    }
  } catch (error) {
    activeComputationPromise = null;
    postMessage({message: 'error', description: error.toString()});
  } finally {
    console.timeEnd("Worker perspective computation")
  }
};

async function transformCanvas(computationId, {srcW, srcH,srcData, fromX, toX, fromY, toY, destCanvas, transformationMatrix, resolution, ratio}) {
  const [c1, c2, c3, c4, c5, c6, c7, c8] = transformationMatrix;

  let destH = Math.ceil((toY - fromY)*resolution)
  let destW = Math.ceil((toX - fromX)*resolution);

  console.log(`${destW}x${destH}`)
  let destData;
  try {
    destData = new ImageData(destW, destH);
  } catch(e) {
    if(['IndexSizeError','RangeError'].includes(e.name)) {
      throw new Error(`Image size ${destW}x${destH} is too large. Try changing the shape or lowering the X multiplier`)
    } else {
      throw e;
    }
  }

  let steps = 0;
  for (let i = 0; i < destH; i++) {
    for (let j = 0; j < destW; j++) {
      // Check it should not abort
      if((steps++) % 10000000 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1));

        if(computationId !== activeComputationId) {
          // true indicates the computation is aborted
          return true;
        }
      }
      // Call the transformation function to get the corresponding src pixel
      const y = (i/resolution + fromY);
      const x = (j/resolution + fromX);

      const n = (c7 * x + c8 * y + 1)/ratio;
      let srcX = (c1 * x + c2 * y + c3) / n;
      let srcY = (c4 * x + c5 * y + c6) / n;

      // Make sure the source coordinates are integers and within the valid range
      srcX = Math.round(srcX);
      srcY = Math.round(srcY);
      if (srcX < 0 || srcX >= srcW || srcY < 0 || srcY >= srcH) {
        continue; // skip out-of-bounds pixels
      }

      // Calculate the indices in the imageData arrays
      let srcIndex = (srcY * srcW + srcX) * 4;
      let destIndex = (i * destW + j) * 4;

      // Copy the pixel data from the src to the dest
      destData.data[destIndex] = srcData.data[srcIndex];         // R
      destData.data[destIndex + 1] = srcData.data[srcIndex + 1]; // G
      destData.data[destIndex + 2] = srcData.data[srcIndex + 2]; // B
      destData.data[destIndex + 3] = srcData.data[srcIndex + 3]; // A
    }
  }

  // Draw the destination imageData to the destCanvas
  destCanvas.width = destW;
  destCanvas.height = destH;
  destCanvas.getContext('2d').putImageData(destData, 0, 0);
}
