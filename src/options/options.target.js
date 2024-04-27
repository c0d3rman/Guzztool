import { stickerify } from 'stickerify';
import { browser } from '@guzztool/util/util.js';

$(document).ready(function () {
    // Set size of toggle switches based on their parent cells
    const stylesheet = Array.from(document.styleSheets)
        .find(sheet => sheet.ownerNode.id === "toggle_switch_css");
    const rule = Array.from(stylesheet.cssRules)
        .find(cssRule => cssRule.selectorText === '.toggle');
    const setSwitchSize = _ => rule.style.setProperty("--size", $('.cell').width() / 10 + 'px');
    $(window).resize(setSwitchSize);
    setSwitchSize();

    // Set original state of switches based on settings
    browser.storage.sync.get('options', data => {
        for (const subtoolId in data.options) {
            if (data.options[subtoolId].enabled) {
                $(`.cell[data-subtool-id="${subtoolId}"] .toggle input`).prop('checked', true);
            }
        }
    });

    // Listen for changes in the toggle switches and update the storage
    $('.toggle input').change(function () {
        $(this).closest('.cell').attr('data-active', $(this).prop('checked'));
        browser.storage.sync.get('options', data => {
            data.options[$(this).closest('.cell').data('subtool-id')]['enabled'] = $(this).prop('checked');
            browser.storage.sync.set({ options: data.options });
        });
    });

    $('.cell .subtool-icon').each(function () {
        // const img2 = new Image();
        // img2.src = stickerify(stickerify(this, 3, 'white'), 1, 'black').toDataURL();
        // $(this).replaceWith(img2);

        const stickerStrokeWidth = 5;

        const newCanvas = document.createElement('canvas');
        newCanvas.classList.add('subtool-icon');
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