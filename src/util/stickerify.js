// Adapted from https://web.archive.org/web/20190410091350/http://artplustech.com/sticker-effect-on-transparent-pngs-with-html5-canvas/
const stickerify = (img, ...args) => {
    const stickerStrokeThickness = 30; // Pixel width is relative to the canvas dimension below

    // We work on a large fixed-size canvas,
    // both so the sticker stroke thickness is consistent regardless of original image size
    // and to maintain high quality even if the screen is later resized
    const canvasDimension = 2000; // Not including sticker stroke
    const scaleFactor = Math.min(canvasDimension / img.width, canvasDimension / img.height); // The amount to scale the image so it fits in the canvas
    const [scaledImgWidth, scaledImgHeight] = [img.width * scaleFactor, img.height * scaleFactor];

    // Create the canvas for the sticker
    const newCanvas = document.createElement('canvas');
    newCanvas.classList.add('subtool-icon');
    const buffer = stickerStrokeThickness * 8; // Some buffer area to avoid clipping at the edges
    newCanvas.width = canvasDimension + buffer;
    newCanvas.height = canvasDimension + buffer;
    const newCtx = newCanvas.getContext('2d');

    // Draw a blurred version of the original image to the canvas
    newCtx.shadowColor = 'white';
    newCtx.shadowBlur = stickerStrokeThickness;
    const imageX = (canvasDimension + buffer - scaledImgWidth) / 2; // Center the image
    const imageY = (canvasDimension + buffer - scaledImgHeight) / 2;
    newCtx.drawImage(img,
        imageX, imageY,
        scaledImgWidth, scaledImgHeight);

    // Turn all non-transparent pixels of the blurred image to full opacity,
    // giving us the outline of the sticker
    const imgData = newCtx.getImageData(0, 0, newCtx.canvas.width - 1, newCtx.canvas.height - 1);
    for (let i = imgData.data.length; i > 0; i -= 4) {
        if (imgData.data[i + 3] > 0) {
            imgData.data[i + 3] = 255;
        }
    }
    newCtx.putImageData(imgData, 0, 0);

    // Draw the original image back onto the canvas, with a drop shadow
    newCtx.shadowColor = '#555';
    newCtx.shadowBlur = stickerStrokeThickness * 2;
    newCtx.shadowOffsetX = 0;
    newCtx.shadowOffsetY = 0;
    newCtx.drawImage(newCanvas, 0, 0);

    // Replace the original image with the sticker
    $(img).replaceWith(newCanvas);
}

export default stickerify;
