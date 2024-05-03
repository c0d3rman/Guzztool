import { browser } from '@guzztool/util/util.js';
import gridTemplate from './grid.handlebars';
import subpageTemplate from './subpage.handlebars';


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

/**
 * Animate an element while moving it to a new spot in the DOM, leaving behind a dummy to prevent the layout of its current parent from changing.
 * Known limitations:
 * - Does not properly handle animating border-box
 * - Resizing the viewport during animation will not maintain responsivity of the element
 * - :hover won't work while animating. You can instead apply a class on hover and then simulate a hover during animation by adding that class.
 * 
 * @param {*} insertFn Function that inserts the element into its target spot in the DOM
 * @param {*} properties CSS properties to animate to, as in $.fn.animate
 * @param {*} options jQuery animate options, as in $.fn.animate
 * @returns the element
 */
jQuery.fn.animateWithDummy = function (insertFn, properties, options) {
    for (const el of this) {
        // Ignore dummies
        if ($(el).hasClass('dummy-spacer')) continue;

        // Save the element's current location and 'position' property
        const offsetTop = $(el).offset().top;
        const offsetLeft = $(el).offset().left;

        // These are all the properties that affect an element's sizing
        const sizeProperties = ["width", "height",
            "padding-top", "padding-bottom", "padding-left", "padding-right",
            "margin-top", "margin-bottom", "margin-left", "margin-right",
            "border-top-width", "border-bottom-width", "border-left-width", "border-right-width", "border-radius",
            "position"]; // Position is in here as a special case because we change it as part of animation

        // Insert dummy at the target location with the final CSS of the element (which will be removed on arrival)
        // We use this to capture the numericized final position and size of the element so we know where to animate it to
        const targetDummy = $(el).clone().addClass('dummy-spacer').css('visibility', 'hidden')
            .css(properties);
        insertFn(targetDummy);
        const targetProperties = sizeProperties.reduce((acc, cssProp) => {
            acc[cssProp] = $(targetDummy).css(cssProp);
            return acc;
        }, {});

        // Save the current values of the CSS properties we'll be modifying, specifically any set on the "style" of the element, so we can undo the change at the end
        const originalCSS = sizeProperties.reduce((acc, cssProp) => {
            acc[cssProp] = $(el).prop('style')[cssProp];
            return acc;
        }, {});

        // Create a dummy at the starting location, to maintain layout
        // (It'll be inserted after we numericize the element, so it doesn't affect the numericization)
        const startDummy = $(el).clone().addClass('dummy-spacer').css('visibility', 'hidden');

        // Numericize the element's size so taking it out of its current parent doesn't affect it (e.g. if it's sized with a percentage)
        sizeProperties.map(cssProp => $(el).css(cssProp, $(el).css(cssProp)));

        // Move the element into the main body and position it so it stays in the same spot, replacing it with the start dummy
        startDummy.insertAfter(el);
        $(el).appendTo('body');
        $(el).css({
            'position': 'absolute',
            'top': `${offsetTop}px`,
            'left': `${offsetLeft}px`,
        });

        // Animate the element to the target location and size (which we infer from where the target dummy ends up)
        $(el).animate(Object.assign({}, properties, {
            top: $(targetDummy).offset().top + (properties.top ?? 0) + 'px',
            left: $(targetDummy).offset().left + (properties.left ?? 0) + 'px',
            // width: $(targetDummy).width(),
            // height: $(targetDummy).height(),
        }, targetProperties), options).promise().done(() => {
            // On arrival:
            $(el).insertAfter(targetDummy); // Properly transfer the element to the target
            targetDummy.remove(); // Remove the target dummy
            $(el).css({ // Reset the offsets that were used for animation
                'top': properties.top ?? '',
                'left': properties.left ?? '',
            })
            $(el).css(Object.assign({}, originalCSS, properties)); // Restore the element's original size-related CSS properties, except any which were animated
            $(this).mouseenter();
        });
    }
    return this;
}


$(document).ready(function () {
    // Set size of toggle switches based on their parent cells
    const stylesheet = Array.from(document.styleSheets)
        .find(sheet => sheet.ownerNode.id === "toggle_switch_css");
    const rule = Array.from(stylesheet.cssRules)
        .find(cssRule => cssRule.selectorText === '.toggle');
    const resize = _ => {
        rule.style.setProperty("--size", $('.cell').width() / 10 + 'px');

        // Fit titles to their cells
        const percentWidth = (el) => $(el).width() / $(el).parent().width();
        const maxPercentWidthName = $('.subtool-name').toArray().reduce((max, el) => percentWidth(el) > percentWidth(max) ? el : max);
        const adjustmentFactor = 1 / percentWidth(maxPercentWidthName);
        const fontSize = parseFloat(window.getComputedStyle(maxPercentWidthName, null).getPropertyValue('font-size'));
        $('.subtool-name').css('font-size', `${adjustmentFactor * fontSize}px`);
    }
    $(window).resize(resize);
    resize();

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

    // Turn all subtool icons into stickers
    $('.cell .subtool-icon').each(function () { stickerify(this) });


    const app = $('#app').get()[0];
    $('.cell').click(function (event) {
        // Stop responding to clicks on all cells
        $('.cell').off('click');

        // Fade out and disable the hover gradient and box shadow
        $(this).addClass('no-gradient');

        // Animate the cell to fill the whole viewport
        // TBD move logo and switch to the positions they'll have on the subpage
        const animationDuration = parseInt(getComputedStyle($("#grid").get()[0], null).getPropertyValue('--subpage-animation-duration')) * 1000; // Get animation duration from CSS
        // $(this).find('*').not('.subtool-icon').fadeOut({ duration: animationDuration, queue: false }); // Fade out all elements within the cell
        // $(this).find('.subtool-icon').animateToAfter(newDiv);
        // $(subpageTemplate()).appendTo($(this)).hide().fadeIn({ duration: animationDuration, queue: false });
        $(this).animateWithDummy(el => el.appendTo($('body')), {
            width: '100%',
            height: '100%',
            aspectRatio: 'unset',
            position: 'absolute',
            top: 0,
            left: 0,
        }, {
            duration: animationDuration, queue: false, always: function () {
            }
        });
        const icon = $(this).find('.subtool-icon');
        icon.css('z-index', 9999);
        $(icon).animateWithDummy(el => el.insertAfter(icon), {
            maxWidth: '400px',
            maxHeight: '400px',
            position: 'absolute',
            top: 0,
            left: 0,
        }, {duration: animationDuration, queue: false});
        //         $('.cell').not(this).hide(); // Prevents scrolling by the grid
        //         $(this).css('position', 'relative'); // Allows scrolling by the subpage

        //         // Test for scrolling
        //         // $(this).css('height', '10000px');
        //         // let randomText = '';
        //         // for (let i = 0; i < 1000; i++) {
        //         //     randomText += Math.random().toString(36).substring(2, 15).repeat(400) + '\n';
        //         // }
        //         // $(this).text(randomText);
        //         // $(this).css('white-space', 'unset');
        //         // $(this).css('justify-content', 'unset');
        //         // $(this).css('align-items', 'unset');
        //         $(this).addClass('subpage');

        //         // TBD load subpage component and fade it in
        //     }
        // }); 
    }).on('click', '.toggle', (e) => e.stopPropagation()); // Don't treat a click on the toggle switch as a click on the parent cell

    // $('#app').on('click', '.back-button', function(){
    //     app.innerHTML = gridTemplate();
    // });
});



// // Fix the position of an element relative to the window
// jQuery.fn.fix = function () {
//     for (const el of this) {
//         if ($(el).attr('data-fix-type') == 'spacer') continue; // Don't fix spacers
//         if ($(el).css('position') == 'fixed') continue; // Don't fix if the element is already fixed

//         // Set a unique ID for this element to tie it to the spacer we'll insert for it
//         // (unless we already have one)
//         const id = $(el).attr('data-fix-id') ?? crypto.randomUUID();
//         $(el).attr('data-fix-id', id);

//         // If we already have a spacer, delete it first
//         // $(el).siblings(`[data-fix-id="${id}"][data-fix-type="spacer"]`).remove();

//         // Insert spacer so the positioning won't be messed up when the element is fixed
//         $(el).clone().css('visibility', 'hidden').attr('data-fix-id', id).attr('data-fix-type', 'spacer').insertAfter(el);

//         // Fix the element's current values numerically
//         $(this).css({
//             position: 'fixed',
//             top: ($(this).offset().top - $(window).scrollTop()) + 'px',
//             left: ($(this).offset().left - $(window).scrollLeft()) + 'px',
//             width: $(this).width() + 'px',
//             height: $(this).height() + 'px',
//             paddingTop: $(this).css('padding-top'),
//             paddingBottom: $(this).css('padding-bottom'),
//             paddingLeft: $(this).css('padding-left'),
//             paddingRight: $(this).css('padding-right'),
//         });
//     }
//     return this;
// }

// jQuery.fn.animateToAfter = function (targetSibling, options) {
//     for (const el of this) {
//         // Ignore spacers
//         if ($(el).hasClass('animateToAfter-spacer')) continue;

//         // Insert spacer at the target location
//         const spacer = $(el).clone().addClass('animateToAfter-spacer').css('visibility', 'hidden').insertAfter(targetSibling);

//         // Save the current values of the CSS properties we'll be modifying
//         const originalCSS = $(el).css(['position', 'top', 'left']);

//         // Change the element's position to relative so we can animate it
//         $(el).css('position', 'relative');

//         // Animate the element to the target location
//         $(el).animate({
//             top: $(spacer).offset().top - $(el).offset().top + 'px',
//             left: $(spacer).offset().left - $(el).offset().left + 'px',
//         }, options).promise().done(() => {
//             // On arrival:
//             spacer.remove(); // Remove the spacer
//             $(el).clone().addClass('animateToAfter-spacer').css('visibility', 'hidden').insertAfter(el) // Insert a spacer at the element's original location (since it's leaving)
//                 .css(originalCSS); // (with original CSS)
//             $(el).insertAfter(targetSibling); // Properly transfer the element to the target
//             $(el).css(originalCSS); // Restore the element's original CSS properties
//         });
//     }
//     return this;
// }