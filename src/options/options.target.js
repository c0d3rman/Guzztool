import { browser } from '@guzztool/util/util.js';
import log from '@guzztool/util/log.js';
import stickerify from '@guzztool/util/stickerify.js';
import subpageTemplate from './subpage.handlebars';





$(function () {
    // Set size of toggle switches based on their parent cells
    const stylesheet = Array.from(document.styleSheets)
        .find(sheet => sheet.ownerNode.id === "toggle_switch_css");
    const rule = Array.from(stylesheet.cssRules)
        .find(cssRule => cssRule.selectorText === '.toggle-switch');
    const resize = _ => {
        rule.style.setProperty("--size", $('.cell').width() / 10 + 'px');

        // Fit titles to their cells
        const percentWidth = (el) => $(el).width() / $(el).parent().width();
        const maxPercentWidthName = $('.subtool-name').toArray().reduce((max, el) => percentWidth(el) > percentWidth(max) ? el : max);
        const adjustmentFactor = 1 / percentWidth(maxPercentWidthName);
        const fontSize = parseFloat(window.getComputedStyle(maxPercentWidthName, null).getPropertyValue('font-size'));
        $('.subtool-name').css('font-size', `${adjustmentFactor * fontSize}px`);
    }
    $(window).on('resize', resize);
    resize();

    // Set original state of switches based on settings
    browser.storage.sync.get('options', data => {
        $('.toggle-switch').addClass('toggle-switch-animation-off');
        for (const subtoolId in data.options) {
            if (data.options[subtoolId].enabled) {
                $(`.cell[data-subtool-id="${subtoolId}"] .toggle-switch input`).prop('checked', true);
            }
        }
        // Wait a little so the animation doesn't trigger on setting initial state
        setTimeout(() => $('.toggle-switch').removeClass('toggle-switch-animation-off'), 1);
    });

    // Listen for changes in the toggle switches and update the storage
    $('.toggle-switch input').change(function () {
        browser.storage.sync.get('options', data => {
            data.options[$(this).closest('.cell').data('subtool-id')]['enabled'] = $(this).prop('checked');
            browser.storage.sync.set({ options: data.options });
        });
    });

    // Turn all subtool icons into stickers
    $('.cell .subtool-icon').each(function () { stickerify(this) });

    // Handle expanding a clicked cell into a subpage
    $('.cell').click(function (event) {
        if ($('#app').find('.subpage').length > 0) return; // If a subpage is already open, don't open another

        const cell = this;

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
        const animationDuration = parseInt(getComputedStyle($("#grid").get()[0], null).getPropertyValue('--subpage-animation-duration')) * 1000; // Get animation duration from CSS
        clone.find('.hover-overlay').animate({ opacity: 0 }, { duration: animationDuration, queue: false });
        setTimeout(() => {
            clone.css({ top: '', left: '' }); // We need to unset these since they take priority over the class
            // Restore the element's original size-related CSS properties onto the clone
            clone.css(Object.assign({}, originalCSS));
        }, 1); // This needs to happen a bit after the class change, otherwise the CSS doesn't animate

        browser.storage.sync.get('options', data => {
            // Create the subpage
            const subtoolId = $(this).data('subtool-id');
            clone.append(subpageTemplate(SUBTOOLS[subtoolId]));

            // Load current settings values
            const currentSettings = data.options[subtoolId].subtool_settings;
            Object.entries(currentSettings).forEach(([id, value]) => {
                const input = clone.find(`input[name="${id}"]`);
                if (input.attr('type') === 'checkbox') {
                    input.prop('checked', value);
                } else {
                    input.val(value);
                }
            });

            // Link input states to their corresponding settings
            clone.find('input').change(function () {
                browser.storage.sync.get('options', data => {
                    const value = $(this).prop("type") === "checkbox" ? $(this).prop("checked") : $(this).val();
                    data.options[subtoolId]['subtool_settings'][$(this).attr('name')] = value;
                    browser.storage.sync.set({ options: data.options });
                });
            });

            // Add a click handler for the back button
            clone.find('.back-button').click(function () {
                // Animate subpage close
                clone.find(".subpage-content").fadeOut(animationDuration);
                clone.css(Object.assign({
                    'position': 'absolute',
                    'top': $(cell).offset().top,
                    'left': $(cell).offset().left,
                }, sizeProperties.reduce((acc, cssProp) => {
                    acc[cssProp] = $(cell).css(cssProp);
                    return acc;
                }, {})));
                setTimeout(() => clone.remove(), animationDuration);
            });
        });
    }).on('click', '.toggle-switch', (e) => e.stopPropagation()); // Don't treat a click on the toggle switch as a click on the parent cell
});
