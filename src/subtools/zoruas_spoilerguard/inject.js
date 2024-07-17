import timerCSSTemplate from './timerCSS.handlebars';


const subtool = {
    init: function () {
        if (!this.roomListener) return;
        this.roomListener.on("new", (roomId, room) => {
            if (roomId.startsWith("battle-")) modifyRoom(room);
        });
    }
}

function getBattleControlsState(room) {
    if (room.battle.scene.customControls) return "custom"; // Empty
    if (room.battle.seeking !== null) return "seeking"; // Empty
    if (!room.battle.atQueueEnd) {
        if (!room.side || room.battleEnded) {
            if (room.battle.paused) {
                return "spectator-paused"; // Full replay controls (resume), Switch Viewpoint
            } else {
                return "spectator-turn-in-progress"; // Full replay controls (pause), Switch Viewpoint
            }
        } else {
            return "turn-in-progress"; // Timer, Skip turn, Skip to end
        }
    }
    if (room.battle.ended) {
        if (room.side) {
            return "ended"; // Download/upload replay, Instant replay, Main menu, Rematch
        } else {
            return "spectator-ended"; // Download/upload replay, Instant replay, Switch viewpoint
        }
    }
    if (room.side) return "player-choosing"; // Timer, player choice controls (or pending controls if a choice has been made but turn hasn't started)
    if (!room.battle.nearSide.name || !room.battle.farSide.name) return "empty-battle"; // "Waiting for players"
    if (room.battle.paused) {
        return "full-battle-paused" // Paused + waiting for players?
    } else {
        return "full-battle-playing" // Playing + waiting for players?
    }
}

function modifyRoom(room) {
    // Create a style tag for hiding and showing the real timer button
    const roomId = room.$el.attr('id');
    $(timerCSSTemplate({ roomId })).appendTo('head');
    const timerHidingCSSRule = Array.from(document.styleSheets).find(sheet => sheet.ownerNode.id === `guzztool-zorua-${roomId}`).cssRules[0];

    let turn0Ended = false; // A flag to track whether we've finished all animations pre turn 1

    // Wrap the updateControls method so we can interfere whenever they're changed
    const updateControls = room.updateControls;
    room.updateControls = (...args) => {
        const state = getBattleControlsState(room);

        if (state == "player-choosing" && room.battle.turn > 0) turn0Ended = true;

        // If a turn is in progress, black out the real timer button
        // Unless we're before turn 1 (i.e. in the animation of an automatic lead being sent out), in which case there's no spoiler risk and people like to turn on the timer then
        if ((state == "turn-in-progress" || state == "spectator-turn-in-progress") && turn0Ended) {
            timerHidingCSSRule.style.setProperty("filter", "brightness(0)", "important");
            timerHidingCSSRule.style.setProperty("width", "70px", "important");
            timerHidingCSSRule.style.setProperty("overflow", "hidden", "important");
            timerHidingCSSRule.style.setProperty("white-space", "nowrap", "important");

            // If the battle is ending (i.e. the player got turned into a spectator watching the last turn),
            // don't updateControls and do it ourselves instead
            if (state == "spectator-turn-in-progress") {
                room.controlsShown = false;
                const fakeTimerButtonHTML = `<button disabled name="openTimer" class="button guzztool-zorua-fake-timerbutton"><i class="fa fa-hourglass-start"></i> Timer</button>`
                room.$controls.html('<p>' + fakeTimerButtonHTML + '<button class="button" name="skipTurn"><i class="fa fa-step-forward"></i><br />Skip turn</button> <button class="button" name="goToEnd"><i class="fa fa-fast-forward"></i><br />Skip to end</button></p>');
                return;
            }
        }
        // In all other states stop hiding the button
        else {
            timerHidingCSSRule.style.removeProperty("filter");
            timerHidingCSSRule.style.removeProperty("width");
            timerHidingCSSRule.style.removeProperty("overflow");
            timerHidingCSSRule.style.removeProperty("white-space");
        }

        // Run the actual updateControls (if we didn't exit early)
        updateControls.apply(room, args);
    }
}

export default subtool;
