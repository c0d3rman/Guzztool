import { stickerify } from 'stickerify';

$(document).ready(function () {
    $('.cell').click(function () {
        var isActive = $(this).attr('data-active') === 'true';
        $(this).attr('data-active', !isActive);
    });

    $('.cell img').each(function () {
        // const img = new Image();
        // img.src = stickerify(this, 3, 'white').toDataURL();
        // $(this).replaceWith(img);
        
        const stickerStrokeWidth = 5;

        const newCanvas = document.createElement('canvas');
        newCanvas.width = this.width + stickerStrokeWidth * 4;
        newCanvas.height = this.height + stickerStrokeWidth * 4;
        const newCtx = newCanvas.getContext('2d');

        newCtx.shadowColor = 'white';
        newCtx.shadowBlur = stickerStrokeWidth;
        // newCtx.shadowOffsetX = 0;
        // newCtx.shadowOffsetY = 0;
        newCtx.drawImage(this, stickerStrokeWidth * 2, stickerStrokeWidth * 2, this.width, this.height);

        // get contents of blurry bordered image
        const img = newCtx.getImageData(0, 0, newCtx.canvas.width - 1, newCtx.canvas.height - 1);
        const opaqueAlpha = 255;

        // turn all non-transparent pixels to full opacity
        for (let i = img.data.length; i > 0; i -= 4) {
            if (img.data[i + 3] > 0) {
                img.data[i + 3] = opaqueAlpha;
            }
        }

        // write transformed opaque pixels back to image
        newCtx.putImageData(img, 0, 0);

        // Create drop shadow
        newCtx.shadowColor = '#555';
        newCtx.shadowBlur = stickerStrokeWidth * 2;
        newCtx.shadowOffsetX = 0;
        newCtx.shadowOffsetY = 0;
        newCtx.drawImage(newCanvas, 0, 0);

        $(this).replaceWith(newCanvas);
    });
});