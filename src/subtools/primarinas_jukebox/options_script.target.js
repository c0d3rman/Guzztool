import browser from 'webextension-polyfill';

function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader);
        reader.readAsDataURL(file);
    });
}

$(document).ready(async function () {
    const data = await browser.storage.sync.get('options');
    console.log(data);
    const settings = data.options['primarinas_jukebox'].subtool_settings.music;

    const sounds = settings.basic.map((s, i) => ({ name: `bgm${i}`, enabled: true, dataURI: `https://play.pokemonshowdown.com/${s.bgmUrl}` }));

    // const sounds = [
    //     { name: 'sound1', enabled: true, dataURI: '' },
    //     { name: 'sound2', enabled: false, dataURI: '' },
    //     { name: 'sound3', enabled: true, dataURI: '' },
    // ];

    function renderSounds() {
        const template = $('#primarinas-jukebox-music-container template')[0];
        $('.uploaded-sounds-list').empty();
        sounds.forEach(sound => {
            const clone = $(template.content.cloneNode(true));
            clone.find('.sound-enable').prop('checked', sound.enabled);
            clone.find('.sound-name').text(sound.name);
            clone.find('.delete-sound').click(function () {
                sounds.splice($(this).parent().index(), 1);
                renderSounds();
            });
            clone.find('audio source').attr('src', sound.dataURI);
            $('.uploaded-sounds-list').append(clone);
        });
    }
    renderSounds();

    $('#primarinas-jukebox-music-container .upload-button').click(async function () {
        const files = Array.from($('#primarinas-jukebox-music-container input[type="file"]')[0].files);
        if (!files.length) return;

        const data = await Promise.all(files.map(file => readAsDataURL(file)));
        for (const [index, file] of files.entries()) {
            const sound = { name: file.name, enabled: true, dataURI: data[index] };
            sounds.push(sound);
        }
        renderSounds();
    });
});