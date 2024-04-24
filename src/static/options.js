$(document).ready(function () {
    $('.cell').click(function () {
        var isActive = $(this).attr('data-active') === 'true';
        $(this).attr('data-active', !isActive);
    });
});