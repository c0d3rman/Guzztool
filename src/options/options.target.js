import { browser } from '@guzztool/util/util.js';
import stickerify from '@guzztool/util/stickerify.js';
import gridTemplate from './grid.handlebars';
import subpageTemplate from './subpage.handlebars';





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
        browser.storage.sync.get('options', data => {
            data.options[$(this).closest('.cell').data('subtool-id')]['enabled'] = $(this).prop('checked');
            browser.storage.sync.set({ options: data.options });
        });
    });

    // Turn all subtool icons into stickers
    $('.cell .subtool-icon').each(function () { stickerify(this) });


    /* Plan:
    - When a cell is clicked, clone it into #app and place the clone on top of it with absolute positioning
    - Give the clone the .subpage class with transitions to make it into a full-viewport thing
    - Style the components inside to position and size themselves properly when children of a .subpage (this will potentially require an inner container for them)
    - Add a sub-component with the handlebars subpage partial
    - When the animation is done, hide the underlying grid (maybe unnecessary)
    - On pressing back, show the grid, perform the animation in reverse (by removing .subpage), and then remove the clone
    */

    $('.cell').click(function (event) {
        $('.cell').off('click'); // Stop responding to clicks on all cells

        // These are all the properties that affect an element's sizing
        const sizeProperties = ["width", "height",
            "padding-top", "padding-bottom", "padding-left", "padding-right",
            "margin-top", "margin-bottom", "margin-left", "margin-right",
            "border-top-width", "border-bottom-width", "border-left-width", "border-right-width", "border-radius"];

        // Save the current values of the CSS properties we'll be modifying, specifically any set on the "style" of the element, so we can undo the change at the end
        const originalCSS = sizeProperties.reduce((acc, cssProp) => {
            acc[cssProp] = $(this).prop('style')[cssProp];
            return acc;
        }, {});

        // Clone the cell into #app, copy its numericized size properties, and place the clone on top of it with absolute positioning
        const clone = $(this).clone().appendTo('#app').css(Object.assign({
            'position': 'absolute',
            'top': $(this).offset().top,
            'left': $(this).offset().left,
        }, sizeProperties.reduce((acc, cssProp) => {
            acc[cssProp] = $(this).css(cssProp);
            return acc;
        }, {})));

        // Clone the canvas data
        const oldCanvas = $(this).find('canvas')[0];
        const newCanvas = clone.find('canvas')[0];
        newCanvas.width = oldCanvas.width;
        newCanvas.height = oldCanvas.height;
        newCanvas.getContext('2d').drawImage(oldCanvas, 0, 0);

        // Clone the current opacity of the hover overlay
        clone.find('.hover-overlay').removeClass('hover-animation-active')
            .css('opacity', $(this).find('.hover-overlay').css('opacity'));

        // Fix the size and position of the settings icon in the clone, since it growing rapidly looks weird
        clone.find('.settings-icon').css(sizeProperties.concat(['top', 'right']).reduce((acc, cssProp) => {
            acc[cssProp] = clone.find('.settings-icon').css(cssProp);
            return acc;
        }, {}));

        // Perform the animation to fullscreen the clone
        clone.addClass('subpage');
        clone.find('.hover-overlay').animate({ opacity: 0 }, { duration: 1000, queue: false });
        setTimeout(() => {
            // clone.find('.hover-overlay').css('opacity', '1');
            console.log("Bing bong");
            clone.css({ top: '', left: '' }); // We need to unset these since they take priority over the class
            const properties = {};
            // Restore the element's original size-related CSS properties onto the clone, except any which were animated
            clone.css(Object.assign({}, originalCSS, properties));
        }, 1);

        // const animationDuration = parseInt(getComputedStyle($("#grid").get()[0], null).getPropertyValue('--subpage-animation-duration')) * 1000; // Get animation duration from CSS
        // const properties = Object.assign({}, originalCSS, {
        //     width: '100%',
        //     height: '100%',
        //     aspectRatio: 'unset',
        //     position: 'absolute',
        //     top: 0,
        //     left: 0,
        // });
        // clone.animate(properties, {
        //     duration: animationDuration, queue: false, always: function () {
        //         console.log("Done")
        //     }
        // });


    }).on('click', '.toggle', (e) => e.stopPropagation()); // Don't treat a click on the toggle switch as a click on the parent cell
});
