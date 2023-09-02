let offscreenCanvas;
let sourceData;
// if (window.Worker) {
  onmessage = (e) => {
    let data = e.data;
    // console.log("Message received from main script",  destWidth, destHeight, srcH, srcW, ratio);

    if(data.canvas) {
      offscreenCanvas = data.canvas;
    }
    if(data.data) {
      sourceData = data.data;
    }
    console.time("Web worker perspective computation")

    try {
      transformCanvas({... data, srcData: sourceData, destCanvas: offscreenCanvas})
    } catch(error) {
      postMessage({message: 'error', description: error.toString()});
    }
    console.timeEnd("Web worker perspective computation")
  };
// } else {
//   console.error("Web worker was invoked outside window.worker scope")
// }



function transformCanvas({srcW, srcH,srcData, fromX, toX, fromY, toY, destCanvas, transformationMatrix, resolution, ratio}) {
  const [c1, c2, c3, c4, c5, c6, c7, c8] = transformationMatrix;

  destCanvas.width = (toX - fromX)*resolution;
  destCanvas.height = (toY - fromY)*resolution;

  let destCtx = destCanvas.getContext('2d');

  let destW = destCanvas.width;

  let destData = destCtx.createImageData(destW, destCanvas.height);

  for (let i = 0; i < destCanvas.height; i++) {
    for (let j = 0; j < destCanvas.width; j++) {
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
  destCtx.putImageData(destData, 0, 0);

  postMessage({message: 'done'});
}
