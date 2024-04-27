import { getChaosDataForFormat, generateRandomSet } from '../../util/ShowdownAPI.js';


const subtool = {
    init: function (guzztool) {
        if (!guzztool.roomListener) return;
        guzztool.roomListener.on("new", (roomId, room) => {
            if (roomId == "teambuilder") {
                // Wrapping updateTeamView allows us to add elements to the team view that will always appear even when it's changed.
                const teambuilderUpdateTeamView = room.updateTeamView;
                room.updateTeamView = (...args) => {
                    teambuilderUpdateTeamView.apply(room, args);

                    // Insert an "I'm feeling lucky" button after the format selector that adds a random set to your clipboard
                    const formatSelect = room.el.querySelector(".teamwrapper > .pad > .teamchartbox > ol.teamchart > li.format-select");
                    if (!formatSelect) return;
                    const luckyButton = document.createElement("button");
                    luckyButton.textContent = "I'm feeling lucky";
                    luckyButton.classList.add("button");
                    luckyButton.addEventListener('click', async () => {
                        const data = await getChaosDataForFormat(room.curTeam.format);
                        const randomMon = Object.keys(data.data)[Math.floor(Math.random() * Object.keys(data.data).length)];
                        const monData = data.data[randomMon];
                        const randomSet = generateRandomSet(randomMon, monData);
                        room.clipboardAdd(randomSet);
                    });
                    formatSelect.insertAdjacentElement('afterend', luckyButton);
                }
            }
        });
    }
}
export default subtool;
