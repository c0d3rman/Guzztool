import stickerify from '@guzztool/util/stickerify';
import browser from 'webextension-polyfill';
import subpageTemplate from './subpage.handlebars';
import firstTimeModalTemplate from './firstTimeModal.handlebars';


$(function () {
    /**
     * Numericizes all given properties of the element.
     * @param {*} el 
     */
    $.fn.numericize = function (props = null, inplace = true) {
        if (props === null) {
            // These are all the properties that affect an element's sizing
            props = ["width", "height",
                "padding-top", "padding-bottom", "padding-left", "padding-right",
                "margin-top", "margin-bottom", "margin-left", "margin-right",
                "border-top-width", "border-bottom-width", "border-left-width", "border-right-width", "border-radius"];
        }
        const getOriginal = (el) => Object.fromEntries(props.map(prop => [prop, $(el).prop('style')[prop]]));
        const getNumericized = (el) => Object.fromEntries(props.map(prop => [prop, $(el).css(prop)]));
        if (inplace) {
            this.each(function () {
                // Save the current values of the CSS properties we'll be modifying,
                // specifically any set on the "style" of the element, so we can undo the change at the end
                $(this).data('_numericize_original_props',
                    Object.assign($(this).data('_numericize_original_props') ?? {}, getOriginal(this)));

                // Numericize the properties
                $(this).css(getNumericized(this));
            });
            return this;
        } else {
            // Return the numericized properties and originals
            return this.map(function () {
                return [getNumericized(this), getOriginal(this)];
            }).get();
        }
    }

    $.fn.unnumericize = function () {
        this.each(function () {
            $(this).css($(this).data('_numericize_original_props'));
            $(this).removeData('_numericize_original_props');
        });
        return this;
    }



    const resize = () => {
        // Set size of toggle switches based on their parent cells (except in subpage)
        $(".cell:not(.subpage) .toggle-switch").css("--size", $('.cell').width() / 10 + 'px');

        // Fit titles to their cells (except in subpage)
        const percentWidth = (el) => $(el).width() / $(el).parent().width();
        const maxPercentWidthName = $('.subtool-name').toArray().reduce((max, el) => percentWidth(el) > percentWidth(max) ? el : max);
        const adjustmentFactor = 1 / percentWidth(maxPercentWidthName);
        const fontSize = parseFloat(window.getComputedStyle(maxPercentWidthName, null).getPropertyValue('font-size'));
        $('.cell:not(.subpage) .subtool-name').css('font-size', `${adjustmentFactor * fontSize}px`);
    }
    $(window).on('resize', resize);
    resize();

    // Set original state of switches based on settings
    browser.storage.sync.get('options').then(async data => {
        $('.toggle-switch').addClass('toggle-switch-animation-off');

        for (const subtoolId in data.options) {
            if (data.options[subtoolId].enabled) {
                $(`.cell[data-subtool-id="${subtoolId}"] .toggle-switch input`).prop('checked', true);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait a little so animation works right

        $('.toggle-switch').removeClass('toggle-switch-animation-off');
    });

    // Listen for changes in the toggle switches and update the storage
    $('.cell-content .toggle-switch input').change(function () {
        browser.storage.sync.get('options').then(data => {
            data.options[$(this).closest('.cell').data('subtool-id')]['enabled'] = $(this).prop('checked');
            browser.storage.sync.set({ options: data.options });
        });
    });

    // Turn all subtool icons into stickers
    $('.cell .subtool-icon').each(function () { stickerify(this) });

    // Handle expanding a clicked cell into a subpage
    $('.cell').click(function (event) {
        if ($('#app').find('.subpage').length > 0) return; // If a subpage is already open, don't open another

        // Numericize the cell's size and position as well as some of its components
        $(this).find('.subtool-icon').numericize(["width", "height"]);
        $(this).find('.settings-icon').numericize().numericize(["top", "right"]); // Fix the size and position of the settings icon, since it growing rapidly looks weird
        $(this).find('.cell-content').numericize(["width", "height"]); // Keep the .cell-content the same size as any other cell
        $(this).numericize().css({
            'position': 'fixed',
            'top': $(this).offset().top - $(window).scrollTop(),
            'left': $(this).offset().left - $(window).scrollLeft(),
        });

        // Move the cell out of the grid and replace with a placeholder
        const placeholder = $('<div class="cell placeholder"></div>').insertAfter(this);
        $(this).appendTo('#app');

        // Perform the animation to fullscreen the cell
        $(this).addClass('subpage');
        const animationDuration = parseInt(getComputedStyle($("#grid").get()[0], null).getPropertyValue('--subpage-animation-duration')) * 1000; // Get animation duration from CSS
        $(this).find('.hover-overlay').animate({ opacity: 0 }, { duration: animationDuration, queue: false })
            .promise().done(() => $("#grid").hide()); // Hide the grid at the end so scrolling turns off
        setTimeout(() => {
            $(this).unnumericize().css({ 'top': '', 'left': '' });
        }, 1); // This needs to happen a bit after the class change, otherwise the CSS doesn't animate

        browser.storage.sync.get('options').then(data => {
            // Create the subpage
            const subtoolId = $(this).data('subtool-id');
            $(this).append(subpageTemplate(SUBTOOLS[subtoolId]));

            // Load current settings values
            const currentSettings = data.options[subtoolId].subtool_settings;
            Object.entries(currentSettings).forEach(([id, value]) => {
                const input = $(this).find(`input[name="${id}"]`);
                if (input.attr('type') === 'checkbox') {
                    input.prop('checked', value);
                } else {
                    input.val(value);
                }
            });

            // Link input states to their corresponding settings
            $(this).find('.subpage-content input').change(function () {
                browser.storage.sync.get('options').then(data => {
                    const value = $(this).prop("type") === "checkbox" ? $(this).prop("checked") : $(this).val();
                    data.options[subtoolId]['subtool_settings'][$(this).attr('name')] = value;
                    browser.storage.sync.set({ options: data.options });
                });
            });

            // Add a click handler for the back button that animates closing the subpage
            $(this).find('.back-button').click(() => {
                // Animate subpage close
                $(this).find(".subpage-content").fadeOut(animationDuration);

                $("#grid").show(); // Unhide the grid (which at this point is still underneath the subpage)
                setTimeout(() => { // Wait a moment so the placeholder finds its position
                    // Scroll so the shrunken cell is vertically centered
                    $('html, body').scrollTop($(placeholder).offset().top - $(placeholder).height() / 2);

                    // Animate the cell back to its grid position (where the placeholder is)
                    const [numericized, original] = $(placeholder).numericize(null, false);
                    $(this).css(Object.assign({
                        'position': 'fixed',
                        'top': placeholder.offset().top - $(window).scrollTop(),
                        'left': placeholder.offset().left - $(window).scrollLeft(),
                    }, numericized));

                    // When the animation is done, replace the placeholder with the actual cell and clean up
                    setTimeout(() => {
                        $(this).removeClass('subpage').insertAfter(placeholder);
                        $(this).find('.subpage-content').remove();
                        placeholder.remove();
                        $(this).find('.subtool-icon').unnumericize();
                        $(this).find('.settings-icon').unnumericize();
                        $(this).find('.cell-content').unnumericize();
                        $(this).css(Object.assign({ position: '', top: '', left: '' }, original));
                    }, animationDuration);
                }, 1);
            });
        });
    }).on('click', '.toggle-switch', (e) => e.stopPropagation()); // Don't treat a click on the toggle switch as a click on the parent cell

    // First-time install modal
    browser.storage.sync.get('firstTimeInstall').then(data => {
        if (data.firstTimeInstall) {
            const modalOverlay = $(firstTimeModalTemplate()).appendTo('body');
            const fadeTimeMs = 300;
            modalOverlay.find("button").click(() => modalOverlay.fadeOut(fadeTimeMs, () => modalOverlay.remove()));
            modalOverlay.click(() => {
                modalOverlay.fadeOut(fadeTimeMs, () => modalOverlay.remove());
            }).on('click', '.first-time-install-modal', (e) => e.stopPropagation());

            browser.storage.sync.set({ firstTimeInstall: false });
        }
    });
});
