import { FunctionListenerProxy } from "@guzztool/util/ListenerProxy";

const MIN_ROLL_SUFFIX = "m";

const subtool = {
  iconUrl: null,
  tooltipData: {},
  cssUrl: null,

  init: async function () {
    this.iconUrl = await this.messaging.sendMessage(
      "get_file_url",
      { file_path: "icon.png" },
      "content-script"
    );

    this.cssUrl = await this.messaging.sendMessage(
      "get_file_url",
      { file_path: "styles.css" },
      "content-script"
    );

    if (!this.roomListener) return;

    this.initTooltip();
    this.injectStyles();
    this.roomListener.on("new", (roomId, room) => {
      if (roomId == "teambuilder") {
        this.initTeambuilder(room);
      } else if (roomId.startsWith("battle-")) {
        this.initBattle(room);
      }
    });
  },

  injectStyles: function () {
    if (document.getElementById("mantis-styles")) return;

    const link = document.createElement("link");
    link.id = "mantis-styles";
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = this.cssUrl;
    document.head.appendChild(link);
  },

  getColors: function () {
    return {
      PHYSICAL: this.options?.physical_color || "#d32f2f",
      SPECIAL: this.options?.special_color || "#1976d2",
    };
  },

  shouldShowBulk: function () {
    return this.options?.show_bulk !== false;
  },

  shouldShowPower: function () {
    return this.options?.show_power !== false;
  },

  shouldShowPowerInSearch: function () {
    return this.options?.show_power_in_search !== false;
  },

  shouldShowBulkInSearch: function () {
    return this.options?.show_bulk_in_search !== false;
  },

  shouldShowModifiedStatsInBattle: function () {
    return this.options?.show_modified_stats_in_battle === true;
  },

  getRollMultiplier: function () {
    return this.options?.min_roll ? 0.714 : 0.84;
  },

  isMinRoll: function () {
    return this.options?.min_roll === true;
  },

  extractFormatId: function (roomId) {
    // Extract format ID from room ID like "battle-gen9randombattle-2394686319"
    return roomId.match(/battle-([^-]+)-\d+/)?.[1] || null;
  },

  calculateBulkRange: function (species, dex, formatId) {
    if (!formatId) return null;

    const statGuesser = new BattleStatGuesser(formatId);
    
    // Calculate minimum bulk (0 EVs, 31 IVs, neutral nature)
    const minSet = { species: species.id, moves: [] };
    const minHp = statGuesser.getStat("hp", minSet, 0, 0);
    const minDef = statGuesser.getStat("def", minSet, 0, 0);
    const minSpd = statGuesser.getStat("spd", minSet, 0, 0);
    
    // Calculate maximum bulk (252 EVs in HP and defensive stat, 31 IVs, defensive boosting nature)
    const maxSet = { species: species.id, moves: [] };
    const maxHp = statGuesser.getStat("hp", maxSet, 252, 0);
    const maxDef = statGuesser.getStat("def", maxSet, 252, 1.1); // +Def nature
    const maxSpd = statGuesser.getStat("spd", maxSet, 252, 1.1); // +SpD nature
    
    const physicalMin = this.formatValue(minHp * minDef);
    const physicalMax = this.formatValue(maxHp * maxDef);
    const specialMin = this.formatValue(minHp * minSpd);
    const specialMax = this.formatValue(maxHp * maxSpd);
    
          return {
        physical: {
          min: physicalMin,
          max: physicalMax,
          minHp: minHp,
          minDef: minDef,
          maxHp: maxHp,
          maxDef: maxDef
        },
        special: {
          min: specialMin,
          max: specialMax,
          minHp: minHp,
          minSpd: minSpd,
          maxHp: maxHp,
          maxSpd: maxSpd
        }
      };
  },

  initTooltip: function () {
    if (document.getElementById("mantis-tooltip")) return;

    const tooltip = document.createElement("div");
    tooltip.id = "mantis-tooltip";
    document.body.appendChild(tooltip);

    window.GuzztoolMantis = {
      showTooltip: this.showTooltip.bind(this),
      hideTooltip: this.hideTooltip.bind(this),
    };

    // Add global mouse move listener to hide tooltip when mouse leaves the element, even if the element is destroyed
    document.addEventListener("mousemove", (event) => {
      const tooltipElement = document.getElementById("mantis-tooltip");
      if (tooltipElement && tooltipElement.style.display !== "none") {
        const target = event.target;
        const isOverTooltipElement = target.closest("[data-bulk-type]") || target.closest(".mantis-power-display");
        if (!isOverTooltipElement) {
          this.hideTooltip();
        }
      }
    });
  },

  getBulkTooltipHTML: function (type, bulkData) {
    const statName = type === "physical" ? "Def" : "SpD";
    const statValue = type === "physical" ? bulkData.def : bulkData.spd;
    
    const bulkValue = parseFloat(bulkData.value);
    const powerValue = 4.0;
    const percent = Math.round((powerValue / bulkValue) * 100);
    const color = type === "physical" ? this.getColors().PHYSICAL : this.getColors().SPECIAL;
    const rollType = this.isMinRoll() ? "min roll" : "max roll";
    const powerSuffix = this.isMinRoll() ? MIN_ROLL_SUFFIX : "";
    const exampleText = `e.g. <span style="color: ${color}">${powerValue.toFixed(1)}${powerSuffix}</span> power vs. <span style="color: ${color}">${bulkData.value}</span> bulk → ${percent}% ${rollType}`;
    
    let noteHtml = "";
    if (bulkData.note) {
      noteHtml = `<p class="mantis-tooltip-note">Assuming ${bulkData.note}</p>`;
    }
    
    return `
      <img src="${this.iconUrl}" class="mantis-tooltip-icon">
      <h4 class="mantis-tooltip-title">${
        type === "physical" ? "Physical" : "Special"
      } Bulk</h4>
      <p class="mantis-tooltip-content">(${
        bulkData.hp
      } HP * ${statValue} ${statName}) / 10000 ≈ ${bulkData.value}</p>
      <p class="mantis-tooltip-example">${exampleText}</p>
      ${noteHtml}
    `;
  },

  getPowerTooltipHTML: function (type, powerData) {
    const typeDisplay = type === "physical" ? "Physical" : "Special";

    if (powerData.value === "?") {
      return `
        <img src="${this.iconUrl}" class="mantis-tooltip-icon">
        <h4 class="mantis-tooltip-title">${typeDisplay} Power</h4>
        <p class="mantis-tooltip-content">Variable Power</p>
      `;
    }

    const attackStatName = type === "Physical" ? "Atk" : "SpA";
    const stabMultiplier = powerData.hasSTAB ? " * 1.5" : "";
    const rollMultiplier = this.getRollMultiplier();
    const suffix = this.isMinRoll() ? MIN_ROLL_SUFFIX : "";
    const minRollExplanation = this.isMinRoll()
      ? `<p class="mantis-tooltip-explanation">"${MIN_ROLL_SUFFIX}" means this power represents the min roll.</p>`
      : "";
    
    const powerValue = Math.round(powerData.value * 10) / 10;
    const percent = Math.round((powerValue / 10.0) * 100);
    const color = powerData.category === "Physical" ? this.getColors().PHYSICAL : this.getColors().SPECIAL;
    const rollType = this.isMinRoll() ? "min roll" : "max roll";
    const exampleText = `e.g. <span style="color: ${color}">${powerData.value}${suffix}</span> power vs. <span style="color: ${color}">10.0</span> bulk → ${percent}% ${rollType}`;
    
    return `
      <img src="${this.iconUrl}" class="mantis-tooltip-icon">
      <h4 class="mantis-tooltip-title">${typeDisplay} Power</h4>
      <p class="mantis-tooltip-content">(${powerData.attackStat} ${attackStatName} * ${powerData.basePower} BP${stabMultiplier}) * ${rollMultiplier} / 10000 ≈ ${powerData.value}${suffix}</p>
      <p class="mantis-tooltip-example">${exampleText}</p>
      ${minRollExplanation}
    `;
  },

  showTooltip: function (event, type, dataId) {
    const data = this.tooltipData[dataId];
    if (!data) return;

    const tooltip = document.getElementById("mantis-tooltip");
    let html = "";

    if (["physical-bulk", "physical-bulk-min", "physical-bulk-max"].includes(type)) {
      html = this.getBulkTooltipHTML("Physical", data);
    } else if (["special-bulk", "special-bulk-min", "special-bulk-max"].includes(type)) {
      html = this.getBulkTooltipHTML("Special", data);
    } else if (type === "physical-power") {
      html = this.getPowerTooltipHTML("Physical", data);
    } else if (type === "special-power") {
      html = this.getPowerTooltipHTML("Special", data);
    }

    tooltip.innerHTML = html;
    tooltip.style.left = `${event.pageX + 15}px`;
    tooltip.style.top = `${event.pageY + 15}px`;
    tooltip.style.display = "block";
  },

  hideTooltip: function () {
    const tooltip = document.getElementById("mantis-tooltip");
    tooltip.style.display = "none";
  },

  generateDataId: function () {
    return "mantis_" + Math.random().toString(36).substring(2, 11);
  },

  initTeambuilder: function (room) {
    this.log.debug("Initializing Mantis Estimation for teambuilder");

    // Proxy functions that update the UI
    const functionsToProxy = [
      "updateStatForm",
      "updateStatGraph",
      "chartSet",
      "updateTeamView",
      "updateSetView",
    ];

    functionsToProxy.forEach((funcName) => {
      const proxy = new FunctionListenerProxy(
        room[funcName],
        (originalFn, ...args) => {
          this.log.debug(`${funcName} called`);
          const result = originalFn(...args);
          this.updateDisplays(room);
          return result;
        }
      );
      room[funcName] = proxy.proxy;
    });

    // Proxy for updateTeamView (team list view)
    const updateTeamViewProxy = new FunctionListenerProxy(
      room.updateTeamView,
      (originalFn, ...args) => {
        this.log.debug("updateTeamView called");
        const result = originalFn(...args);
        this.updateTeamDisplays(room);
        return result;
      }
    );
    room.updateTeamView = updateTeamViewProxy.proxy;

    // Proxy for updateSetView (individual set view)
    const updateSetViewProxy = new FunctionListenerProxy(
      room.updateSetView,
      (originalFn, ...args) => {
        this.log.debug("updateSetView called");
        const result = originalFn(...args);
        this.updateDisplays(room);
        return result;
      }
    );
    room.updateSetView = updateSetViewProxy.proxy;

    // Proxy for BattleSearch.updateScroll to add power displays to move search and bulk displays to pokemon search
    const updateScrollProxy = new FunctionListenerProxy(
      BattleSearch.prototype.updateScroll,
      (originalFn, ...args) => {
        this.log.debug("BattleSearch.updateScroll called");
        const result = originalFn(...args);
        if (room.curChartType === "move") {
          this.updateMoveSearchDisplays(room);
        } else if (room.curChartType === "pokemon") {
          this.updatePokemonSearchDisplays(room);
        }
        return result;
      }
    );
    BattleSearch.prototype.updateScroll = updateScrollProxy.proxy;

    // Proxy for BattleSearch.sort to add support for sorting by power values
    const sortProxy = new FunctionListenerProxy(
      BattleMoveSearch.prototype.sort,
      (originalFn, results, sortCol, reverseSort) => {
        // Handle power sorting
        if (sortCol === "mantispow") {
          this.log.debug("Sorting by mantis power");

          const sortOrder = reverseSort ? -1 : 1;
          return results.sort(([rowType1, id1], [rowType2, id2]) => {
            // For moves, calculate power based on current Pokemon set
            if (rowType1 === "move" && rowType2 === "move") {
              if (!room.curSet) return 0;

              const species = room.curTeam.dex.species.get(room.curSet.species);
              if (!species) return 0;

              const move1 = room.curTeam.dex.moves.get(id1);
              const move2 = room.curTeam.dex.moves.get(id2);

              if (!move1 || !move2) return 0;

              // Handle status moves (lowest priority)
              if (move1.category === "Status" && move2.category === "Status")
                return 0;
              if (move1.category === "Status") return sortOrder;
              if (move2.category === "Status") return -sortOrder;

              const powerData1 = this.calculateMovePower(
                room.curSet,
                move1,
                species,
                room.curTeam.dex
              );
              const powerData2 = this.calculateMovePower(
                room.curSet,
                move2,
                species,
                room.curTeam.dex
              );

              // Handle variable power moves (?) - middle priority
              const isVariable1 = !powerData1 || powerData1.value === "?";
              const isVariable2 = !powerData2 || powerData2.value === "?";

              if (isVariable1 && isVariable2) return 0;
              if (isVariable1) return sortOrder;
              if (isVariable2) return -sortOrder;

              // Handle regular power moves (highest priority)
              if (!powerData1) return sortOrder;
              if (!powerData2) return -sortOrder;

              const power1 = parseFloat(powerData1.value);
              const power2 = parseFloat(powerData2.value);

              // Handle NaN values (shouldn't happen but just in case)
              if (isNaN(power1) && isNaN(power2)) return 0;
              if (isNaN(power1)) return sortOrder;
              if (isNaN(power2)) return -sortOrder;

              return (power2 - power1) * sortOrder;
            }

            // For non-move rows, fall back to original sorting
            return 0;
          });
        }

        // Call original function for all other sort columns
        return originalFn(results, sortCol, reverseSort);
      }
    );
    BattleMoveSearch.prototype.sort = sortProxy.proxy;

    // Proxy for BattlePokemonSearch.sort to add support for sorting by bulk values
    const pokemonSortProxy = new FunctionListenerProxy(
      BattlePokemonSearch.prototype.sort,
      (originalFn, results, sortCol, reverseSort) => {
        // Shared cache for this sort call (single stat type per call)
        const bulkCache = {};
        // Helper to get (and cache) bulk value for a species id
        const getBulk = (speciesId, statType, cache = bulkCache) => {
          if (cache[speciesId] !== undefined) return cache[speciesId];
          const species = room.curTeam.dex.species.get(speciesId);
          if (!species) {
            cache[speciesId] = NaN;
            return NaN;
          }
          // Use the current set for all fields except species
          let baseSet = room.curSet ? { ...room.curSet } : {};
          baseSet.species = species;
          const bulkData = this.calculateBulkValues(
            { pokemonSet: baseSet },
            species,
            room.curTeam.dex
          );
          if (!bulkData || !bulkData[statType]) {
            cache[speciesId] = NaN;
            return NaN;
          }
          const value = parseFloat(bulkData[statType].value);
          cache[speciesId] = value;
          return value;
        };
        // Physical bulk sorting
        if (sortCol === "mantispbulk") {
          this.log.debug("Sorting by mantis physical bulk");
          const sortOrder = reverseSort ? -1 : 1;
          return results.sort(([rowType1, id1], [rowType2, id2]) => {
            if (rowType1 === "pokemon" && rowType2 === "pokemon") {
              if (!room.curSet) return 0;
              const bulk1 = getBulk(id1, "physical");
              const bulk2 = getBulk(id2, "physical");
              if (isNaN(bulk1) && isNaN(bulk2)) return 0;
              if (isNaN(bulk1)) return sortOrder;
              if (isNaN(bulk2)) return -sortOrder;
              return (bulk2 - bulk1) * sortOrder;
            }
            return 0;
          });
        }
        // Special bulk sorting
        if (sortCol === "mantissbulk") {
          this.log.debug("Sorting by mantis special bulk");
          const sortOrder = reverseSort ? -1 : 1;
          return results.sort(([rowType1, id1], [rowType2, id2]) => {
            if (rowType1 === "pokemon" && rowType2 === "pokemon") {
              if (!room.curSet) return 0;
              const bulk1 = getBulk(id1, "special");
              const bulk2 = getBulk(id2, "special");
              if (isNaN(bulk1) && isNaN(bulk2)) return 0;
              if (isNaN(bulk1)) return sortOrder;
              if (isNaN(bulk2)) return -sortOrder;

              return (bulk2 - bulk1) * sortOrder;
            }
            return 0;
          });
        }

        // Call original function for all other sort columns
        return originalFn(results, sortCol, reverseSort);
      }
    );
    BattlePokemonSearch.prototype.sort = pokemonSortProxy.proxy;
  },

  initBattle: function (room) {
    this.log.debug("Initializing Mantis Estimation for battle");

    // Proxy updateMoveControls to add power displays to move buttons
    const updateMoveControlsProxy = new FunctionListenerProxy(
      room.updateMoveControls,
      (originalFn, ...args) => {
        this.log.debug("updateMoveControls called");
        const result = originalFn(...args);
        this.updateBattleMoveDisplays(room);
        return result;
      }
    );
    room.updateMoveControls = updateMoveControlsProxy.proxy;

    // Proxy showTooltip to add power and bulk values to tooltips
    const showTooltipProxy = new FunctionListenerProxy(
      room.battle.scene.tooltips.showTooltip,
      (originalFn, ...args) => {
        const result = originalFn(...args);
        this.modifyTooltipContent(room);
        return result;
      }
    );
    room.battle.scene.tooltips.showTooltip = showTooltipProxy.proxy;
  },

  updateDisplays: function (room) {
    if (!room.curSet) return;

    this.addDisplaysToElement(
      room.el,
      room.curSet,
      room.curTeam.dex.species.get(room.curSet.species),
      room.curTeam.dex,
      false
    );
  },

  updateTeamDisplays: function (room) {
    if (!room.curSetList || !room.curSetList.length) return;

    room.curSetList.forEach((set, index) => {
      if (!set) return;

      const species = room.curTeam.dex.species.get(set.species);
      if (!species) return;

      // Find the specific Pokemon's container in the team view
      const pokemonContainer = room.el.querySelector(`li[value="${index}"]`);
      if (!pokemonContainer) return;

      this.addDisplaysToElement(
        pokemonContainer,
        set,
        species,
        room.curTeam.dex,
        true
      );
    });
  },

  updateMoveSearchDisplays: function (room) {
    if (!this.shouldShowPowerInSearch()) return;
    if (!room.curSet) return;

    this.log.debug("Updating move search displays");

    const species = room.curTeam.dex.species.get(room.curSet.species);
    if (!species) return;

    // Find all move entries in the search results
    const moveEntries = room.el.querySelectorAll(
      '.teambuilder-results .result a[data-entry^="move|"]'
    );

    // Add header for the new column if not present
    const headerRow = room.el.querySelector(".teambuilder-results .sortrow");
    if (headerRow && !headerRow.querySelector(".mantis-estpowercol")) {
      const powerHeader = headerRow.querySelector(".powersortcol");
      if (powerHeader) {
        const estHeader = document.createElement("button");
        estHeader.className = "sortcol mantis-estpowercol powersortcol";
        estHeader.setAttribute("data-sort", "mantispow");
        estHeader.innerHTML = "MPow";
        powerHeader.insertAdjacentElement("afterend", estHeader);
      }
    }

    moveEntries.forEach((entry) => {
      // Remove any existing power columns
      const existingDisplay = entry.querySelector(".mantis-estpowercol");
      if (existingDisplay) {
        existingDisplay.remove();
      }

      // Always insert a blank col for spacing
      const estCol = document.createElement("span");
      estCol.className = "col labelcol mantis-estpowercol";

      // Extract move name from data-entry attribute
      const dataEntry = entry.getAttribute("data-entry");
      if (!dataEntry) return;

      const moveName = dataEntry.split("|")[1];
      if (!moveName) return;

      const move = room.curTeam.dex.moves.get(moveName);

      if (move && move.category !== "Status") {
        const powerData = this.calculateMovePower(
          { pokemonSet: room.curSet },
          move,
          species,
          room.curTeam.dex
        );
        if (powerData) {
          const powerDisplay = this.createPowerDisplayElement(powerData);
          powerDisplay.classList.add("move-search-power");

          // Add tooltip handlers
          const type =
            powerData.category === "Physical"
              ? "physical-power"
              : "special-power";
          this.addTooltipToElement(powerDisplay, type, powerData);

          estCol.appendChild(document.createElement("em"));
          estCol.appendChild(document.createElement("br"));
          estCol.appendChild(powerDisplay);
        }
      }
      // Insert the column after .labelcol
      const labelCol = entry.querySelector(".labelcol");
      if (labelCol) {
        labelCol.insertAdjacentElement("afterend", estCol);
      }
    });
  },

  updatePokemonSearchDisplays: function (room) {
    if (!this.shouldShowBulkInSearch()) return;

    this.log.debug("Updating pokemon search displays");

    // Find all pokemon entries in the search results
    const pokemonEntries = room.el.querySelectorAll(
      '.teambuilder-results .result a[data-entry^="pokemon|"]'
    );

    // Add headers for the new columns if not present
    const headerRow = room.el.querySelector(".teambuilder-results .sortrow");
    if (headerRow && !headerRow.querySelector(".mantis-pbulksortcol")) {
      const lastHeader = headerRow.querySelector(".sortcol:last-child");
      if (lastHeader) {
        // Add Physical Bulk header
        const pBulkHeader = document.createElement("button");
        pBulkHeader.className = "sortcol statsortcol mantis-pbulksortcol";
        pBulkHeader.setAttribute("data-sort", "mantispbulk");
        pBulkHeader.innerHTML = "PB";
        lastHeader.insertAdjacentElement("afterend", pBulkHeader);

        // Add Special Bulk header
        const sBulkHeader = document.createElement("button");
        sBulkHeader.className = "sortcol statsortcol mantis-sbulksortcol";
        sBulkHeader.setAttribute("data-sort", "mantissbulk");
        sBulkHeader.innerHTML = "SB";
        pBulkHeader.insertAdjacentElement("afterend", sBulkHeader);
      }
    }

    pokemonEntries.forEach((entry) => {
      // Remove any existing bulk columns
      entry.querySelector(".mantis-pbulkcol")?.remove();
      entry.querySelector(".mantis-sbulkcol")?.remove();

      // Extract species from data-entry attribute
      const species = room.curTeam.dex.species.get(
        entry.getAttribute("data-entry")?.split("|")[1]
      );

      // Use the current set for all fields except species
      let baseSet = room.curSet ? { ...room.curSet } : {};
      baseSet.species = species;
      const bulkValues = this.calculateBulkValues(
        { pokemonSet: baseSet },
        species,
        room.curTeam.dex
      );

      // Create Physical Bulk column
      const pBulkCol = document.createElement("span");
      pBulkCol.className = "col bstcol mantis-pbulkcol";

      const pBulkDisplay = document.createElement("span");
      pBulkDisplay.textContent = bulkValues.physical.value;
      pBulkDisplay.style.color = this.getColors().PHYSICAL;
      pBulkDisplay.classList.add("pokemon-search-bulk");

      // Add tooltip handlers for physical bulk
      this.addTooltipToElement(pBulkDisplay, "physical-bulk", bulkValues.physical);

      const pbEm = document.createElement("em");
      pbEm.textContent = "PB";
      pbEm.appendChild(document.createElement("br"));
      pbEm.appendChild(pBulkDisplay);
      pBulkCol.appendChild(pbEm);

      // Create Special Bulk column
      const sBulkCol = document.createElement("span");
      sBulkCol.className = "col bstcol mantis-sbulkcol";

      const sBulkDisplay = document.createElement("span");
      sBulkDisplay.textContent = bulkValues.special.value;
      sBulkDisplay.style.color = this.getColors().SPECIAL;
      sBulkDisplay.classList.add("pokemon-search-bulk");

      // Add tooltip handlers for special bulk
      this.addTooltipToElement(sBulkDisplay, "special-bulk", bulkValues.special);

      const sbEm = document.createElement("em");
      sbEm.textContent = "SB";
      sbEm.appendChild(document.createElement("br"));
      sbEm.appendChild(sBulkDisplay);
      sBulkCol.appendChild(sbEm);

      // Insert the columns after .bstcol
      const bstCol = entry.querySelector(".bstcol");
      if (bstCol) {
        bstCol.insertAdjacentElement("afterend", pBulkCol);
        pBulkCol.insertAdjacentElement("afterend", sBulkCol);
      }
    });
  },

  addDisplaysToElement: function (container, set, species, dex, isTeamList) {
    if (!species) return;

    if (this.shouldShowBulk()) {
      this.addBulkDisplay(container, set, species, dex, isTeamList);
    }
    if (this.shouldShowPower()) {
      this.addPowerDisplays(container, set, species, dex, isTeamList);
    }
  },

  addBulkDisplay: function (container, set, species, dex, isTeamList) {
    const statsButton = container.querySelector("button.setstats");
    if (!statsButton) return;

    statsButton.classList.add("mantis-container");
    let existingBulk = statsButton.querySelector(".mantis-bulk-display");
    if (existingBulk) existingBulk.remove();

    const bulkValues = this.calculateBulkValues({ pokemonSet: set }, species, dex);
    const bulkElement = this.createBulkDisplayElement(bulkValues);
    bulkElement.classList.add("teambuilder-bulk");

    this.addTooltipHandlers(bulkElement, bulkValues, isTeamList);
    statsButton.prepend(bulkElement);
  },

  addPowerDisplays: function (container, set, species, dex, isTeamList) {
    const moveInputs = container.querySelectorAll(".setcol-moves .chartinput");

    moveInputs.forEach((input, index) => {
      const moveName = isTeamList ? set.moves[index] : input.value;
      if (!moveName) return;

      const move = dex.moves.get(moveName);
      if (!move) return;

      const powerData = this.calculateMovePower({ pokemonSet: set }, move, species, dex);
      if (!powerData) return;

      this.addPowerDisplayToInput(input, powerData, index, isTeamList);
    });
  },

  addPowerDisplayToInput: function (input, powerData, index, isTeamList) {
    const parentCell = input.parentElement;
    if (!parentCell) return;

    let oldDisplay = parentCell.querySelector(".mantis-power-display");
    if (oldDisplay) oldDisplay.remove();

    parentCell.classList.add("mantis-container");
    const display = this.createPowerDisplayElement(powerData);

    // Add positioning classes
    display.classList.add("teambuilder-power");
    if (index === 0) {
      display.classList.add("first-move");
    }

    // Add tooltip handlers
    const type =
      powerData.category === "Physical" ? "physical-power" : "special-power";
    this.addTooltipToElement(display, type, powerData, isTeamList);

    parentCell.appendChild(display);
  },

  addTooltipHandlers: function (bulkElement, bulkValues, isTeamList) {
    const physBulkSpan = bulkElement.querySelector(
      '[data-bulk-type="physical"]'
    );
    this.addTooltipToElement(physBulkSpan, "physical-bulk", bulkValues.physical, isTeamList);

    const specBulkSpan = bulkElement.querySelector(
      '[data-bulk-type="special"]'
    );
    this.addTooltipToElement(specBulkSpan, "special-bulk", bulkValues.special, isTeamList);
  },

  createBulkDisplayElement: function (bulkValues) {
    const colors = this.getColors();
    const bulkDisplay = document.createElement("div");
    bulkDisplay.className = "mantis-bulk-display";

    const physBulk = document.createElement("span");
    physBulk.textContent = bulkValues.physical.value;
    physBulk.style.color = colors.PHYSICAL;
    physBulk.dataset.bulkType = "physical";

    const separator = document.createTextNode(" / ");

    const specBulk = document.createElement("span");
    specBulk.textContent = bulkValues.special.value;
    specBulk.style.color = colors.SPECIAL;
    specBulk.dataset.bulkType = "special";

    bulkDisplay.appendChild(physBulk);
    bulkDisplay.appendChild(separator);
    bulkDisplay.appendChild(specBulk);

    return bulkDisplay;
  },

  createBulkRangeDisplayElement: function (bulkRangeValues, species) {
    const colors = this.getColors();
    const bulkDisplay = document.createElement("div");
    bulkDisplay.className = "mantis-bulk-display mantis-bulk-range-display";
    bulkDisplay.style.fontStyle = "italic";

    const physBulkMin = document.createElement("span");
    physBulkMin.textContent = bulkRangeValues.physical.min;
    physBulkMin.style.color = colors.PHYSICAL;
    physBulkMin.dataset.bulkType = "physical-min";

    const physBulkMax = document.createElement("span");
    physBulkMax.textContent = bulkRangeValues.physical.max;
    physBulkMax.style.color = colors.PHYSICAL;
    physBulkMax.dataset.bulkType = "physical-max";

    const physSeparator = document.createTextNode("-");

    const separator = document.createTextNode(" / ");

    const specBulkMin = document.createElement("span");
    specBulkMin.textContent = bulkRangeValues.special.min;
    specBulkMin.style.color = colors.SPECIAL;
    specBulkMin.dataset.bulkType = "special-min";

    const specBulkMax = document.createElement("span");
    specBulkMax.textContent = bulkRangeValues.special.max;
    specBulkMax.style.color = colors.SPECIAL;
    specBulkMax.dataset.bulkType = "special-max";

    const specSeparator = document.createTextNode("-");

    [physBulkMin, physSeparator, physBulkMax, separator, specBulkMin, specSeparator, specBulkMax]
      .forEach(el => bulkDisplay.appendChild(el));

    // Add tooltip handlers for min values
    const minBulkData = {
      physical: {
        value: bulkRangeValues.physical.min,
        hp: bulkRangeValues.physical.minHp,
        def: bulkRangeValues.physical.minDef,
        note: `0 HP / 0 Def ${species.name} (Base HP: ${species.baseStats.hp} / Base Def: ${species.baseStats.def})`
      },
      special: {
        value: bulkRangeValues.special.min,
        hp: bulkRangeValues.special.minHp,
        spd: bulkRangeValues.special.minSpd,
        note: `0 HP / 0 SpD ${species.name} (Base HP: ${species.baseStats.hp} / Base SpD: ${species.baseStats.spd})`
      }
    };
    this.addTooltipToElement(physBulkMin, "physical-bulk", minBulkData.physical, false);
    this.addTooltipToElement(specBulkMin, "special-bulk", minBulkData.special, false);

    // Add tooltip handlers for max values
    const maxBulkData = {
      physical: {
        value: bulkRangeValues.physical.max,
        hp: bulkRangeValues.physical.maxHp,
        def: bulkRangeValues.physical.maxDef,
        note: `252 HP / 252+ Def ${species.name} (Base HP: ${species.baseStats.hp} / Base Def: ${species.baseStats.def})`
      },
      special: {
        value: bulkRangeValues.special.max,
        hp: bulkRangeValues.special.maxHp,
        spd: bulkRangeValues.special.maxSpd,
        note: `252 HP / 252+ SpD ${species.name} (Base HP: ${species.baseStats.hp} / Base SpD: ${species.baseStats.spd})`
      }
    };
    this.addTooltipToElement(physBulkMax, "physical-bulk", maxBulkData.physical, false);
    this.addTooltipToElement(specBulkMax, "special-bulk", maxBulkData.special, false);

    return bulkDisplay;
  },

  createPowerDisplayElement: function (powerData) {
    const colors = this.getColors();
    const display = document.createElement("span");
    display.className = "mantis-power-display";

    // Add suffix for min-roll values, but not for "?"
    const suffix =
      this.isMinRoll() && powerData.value !== "?" ? MIN_ROLL_SUFFIX : "";
    display.textContent = powerData.value + suffix;
    display.style.color =
      powerData.category === "Physical" ? colors.PHYSICAL : colors.SPECIAL;

    return display;
  },

  calculateBulkValues: function ({ pokemonSet, serverPokemon, clientPokemon }, species, dex) {
    const stats = this.getStats({ pokemonSet, serverPokemon, clientPokemon });
    if (!stats) return null;
    
    const hp = stats.hp;
    const def = stats.def;
    const spd = stats.spd;

    // Apply item effects only if not using modified stats
    let finalDef = def;
    let finalSpd = spd;
    
    const item = serverPokemon?.item || clientPokemon?.item || pokemonSet?.item;
    if (item) {
      const itemData = dex.items.get(item);
      if (itemData) {
        if (itemData.id === "assaultvest") {
          finalSpd = Math.floor(spd * 1.5);
        } else if (itemData.id === "eviolite" && species.nfe) {
          finalDef = Math.floor(def * 1.5);
          finalSpd = Math.floor(spd * 1.5);
        }
      }
    }

    const physicalBulk = this.formatValue(hp * finalDef);
    const specialBulk = this.formatValue(hp * finalSpd);

    return {
      physical: {
        value: physicalBulk,
        hp: hp,
        def: finalDef,
      },
      special: {
        value: specialBulk,
        hp: hp,
        spd: finalSpd,
      },
    };
  },

  calculateMovePower: function ({ pokemonSet, serverPokemon, clientPokemon }, move, species, dex) {
    if (move.category === "Status") {
      return null;
    }

    const isPhysical = move.category === "Physical";
    const stats = this.getStats({ pokemonSet, serverPokemon, clientPokemon });
    const attackStat = isPhysical ? stats.atk : stats.spa;
    const hasSTAB = species.types.includes(move.type);
    const rollMultiplier = this.getRollMultiplier();

    // Determine base power
    let basePower = move.basePower;
    if (room.battle && clientPokemon && serverPokemon) {
      const tooltipText = room.battle.scene.tooltips.showMoveTooltip(move, "", clientPokemon, serverPokemon);
      const basePowerMatch = tooltipText.match(/Base power: (\d+)/);
      if (basePowerMatch) {
        basePower = parseInt(basePowerMatch[1]);
      }
    }

    let power = attackStat * basePower * rollMultiplier;
    if (hasSTAB) {
      power *= 1.5;
    }

    return {
      category: move.category,
      attackStat: attackStat,
      basePower: basePower,
      hasSTAB: hasSTAB,
      value: this.formatValue(power, basePower),
    };
  },

  updateBattleMoveDisplays: function (room) {
    if (!this.shouldShowPower()) return;

    // Get the active Pokemon from the battle
    const battle = room.battle;
    if (!battle) return;

    // Get the current move request to see what moves are available
    if (!room.request) return;

    if (!room.request.active) return;

    const moveRequest = room.request.active[0];
    if (!moveRequest || !moveRequest.moves) return;

    // Get the active Pokemon from the request side data
    if (!room.request.side || !room.request.side.pokemon) return;

    const activePokemon = room.request.side.pokemon.find(
      (pokemon) => pokemon.active
    );
    if (!activePokemon) return;

    // Find all move buttons in the battle
    const moveButtons = room.$el.find(".movebutton");

    moveButtons.each((index, button) => {
      const $button = $(button);

      // Remove any existing power displays
      $button.find(".mantis-power-display").remove();

      // Get move data from the battle data structure
      if (index >= moveRequest.moves.length) return;

      const moveData = moveRequest.moves[index];
      if (!moveData || !moveData.move) return;

      const moveName = moveData.move;

      // Get move data from the battle's dex
      const move = battle.dex.moves.get(moveName);
      if (!move || move.category === "Status") return;

      // Get species data
      const species = battle.dex.species.get(
        activePokemon.speciesForme || activePokemon.name
      );
      if (!species) return;

      // Get the Pokemon from the battle scene for tooltip calculations
      const teamIndex = room.request.side.pokemon.indexOf(activePokemon);
      const pokemon =
        battle.nearSide.active[
          teamIndex + battle.pokemonControlled * Math.floor(battle.mySide.n / 2)
        ];
      if (!pokemon) return;

      // Calculate power using the actual base power
      const powerData = this.calculateMovePower(
        { clientPokemon: pokemon, serverPokemon: activePokemon },
        move,
        species,
        battle.dex
      );
      if (!powerData) return;

      // Create and add power display
      const powerDisplay = this.createPowerDisplayElement(powerData);

      // Add positioning classes
      powerDisplay.classList.add("battle-power");

      // Add tooltip handlers for battle displays
      const type = powerData.category === "Physical" ? "physical-power" : "special-power";
      this.addTooltipToElement(powerDisplay, type, powerData);

      $button.addClass("mantis-container");
      $button.append(powerDisplay);
    });
  },

  modifyTooltipContent: function (room) {
    if (!this.shouldShowPower() && !this.shouldShowBulk()) return;

    const tooltipWrapper = document.getElementById("tooltipwrapper");
    const tooltipBody = tooltipWrapper?.querySelector(".tooltipinner .tooltip");
    if (!tooltipBody) return;

    const args = document
      .querySelector("[data-tooltip]:hover")
      .dataset.tooltip.split("|");
    const type = args[0];
    let clientPokemon = null;
    let serverPokemon = null;
    const battle = room.battle;

    if (type === "switchpokemon") {
      // switchpokemon|POKEMON
      // serverPokemon definitely exists, clientPokemon maybe
      const pokemonIndex = parseInt(args[1], 10);
      serverPokemon = battle.myPokemon[pokemonIndex];
      
      // Try to get client Pokemon if available
      if (pokemonIndex < battle.mySide.active.length && pokemonIndex < battle.pokemonControlled) {
        clientPokemon = battle.mySide.active[pokemonIndex];
        if (clientPokemon && clientPokemon.side === battle.mySide.ally) {
          clientPokemon = null;
        }
      }
    } else if (type === "activepokemon") {
      // activepokemon|SIDE|ACTIVE
      // clientPokemon definitely exists, serverPokemon maybe
      const sideIndex = parseInt(args[1], 10);
      const side = battle.sides[+battle.viewpointSwitched ^ sideIndex];
      const activeIndex = parseInt(args[2], 10);
      let pokemonIndex = activeIndex;
      
      if (activeIndex >= 1 && battle.sides.length > 2) {
        pokemonIndex -= 1;
        const newSide = battle.sides[side.n + 2];
        clientPokemon = newSide.active[activeIndex];
      } else {
        clientPokemon = side.active[activeIndex];
      }
      
      // Get serverPokemon if it's our side
      if (side === battle.mySide && battle.myPokemon) {
        serverPokemon = battle.myPokemon[pokemonIndex];
      } else if (side === battle.mySide.ally && battle.myAllyPokemon) {
        serverPokemon = battle.myAllyPokemon[pokemonIndex];
      }
      // If it's the enemy, we don't have stats, so will use bulk ranges
    } else if (type === "pokemon") {
      // pokemon|SIDE|POKEMON
      // clientPokemon definitely exists, serverPokemon always ignored
      const sideIndex = parseInt(args[1], 10);
      const side = battle.sides[sideIndex];
      const pokemonIndex = parseInt(args[2], 10);
      clientPokemon = side.pokemon[pokemonIndex];
      
      // For pokemon tooltips from the team sidebar (on both sides), we don't have stats
      // Will use bulk ranges instead
    } else {
      return;
    }

    this.log.debug(`Pokemon data for tooltip type: ${type}`, { clientPokemon, serverPokemon });

    // Get species data from clientPokemon if available, otherwise from serverPokemon
    const speciesName = clientPokemon?.speciesForme || serverPokemon?.speciesForme;
    if (!speciesName) return;
    
    const species = battle.dex.species.get(speciesName);
    if (!species) return;

    // Add bulk display to top right of tooltip
    if (this.shouldShowBulk()) {
      let bulkElement;
      
      // Try to calculate actual bulk values first
      const bulkValues = this.calculateBulkValues(
        { clientPokemon, serverPokemon },
        species,
        battle.dex
      );
      
      if (bulkValues) {
        bulkElement = this.createBulkDisplayElement(bulkValues);
        this.addTooltipHandlers(bulkElement, bulkValues, false);
      } else if (type === "pokemon" || type === "activepokemon") {
        // If we can't get actual stats, calculate bulk ranges for pokemon and activepokemon tooltips
        const formatId = this.extractFormatId(room.id);
        const bulkRangeValues = this.calculateBulkRange(species, battle.dex, formatId);
        
        if (bulkRangeValues) {
          bulkElement = this.createBulkRangeDisplayElement(bulkRangeValues, species);
        }
      }
      
      if (bulkElement) {
        bulkElement.classList.add("battle-bulk");
        tooltipBody.querySelector("h2").appendChild(bulkElement);
      }
    }

    // Add power values to moves
    if (this.shouldShowPower()) {
      const moveElements = tooltipBody.querySelectorAll("br");
      moveElements.forEach((br) => {
        const textNode = br.previousSibling;
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

        const moveText = textNode.textContent.trim();
        if (!moveText.startsWith("• ")) return;

        const move = battle.dex.moves.get(moveText.substring(2));
        if (!move || move.category === "Status") return;

        const powerData = this.calculateMovePower(
          { clientPokemon, serverPokemon },
          move,
          species,
          battle.dex
        );
        if (!powerData) return;

        const powerDisplay = this.createPowerDisplayElement(powerData);
        powerDisplay.textContent = ` (${powerDisplay.textContent})`;

        // Add tooltip handlers for battle tooltips
        const type = powerData.category === "Physical" ? "physical-power" : "special-power";
        this.addTooltipToElement(powerDisplay, type, powerData);

        br.parentNode.insertBefore(powerDisplay, br);
      });
    }
  },

  // Unified helper for formatting values with consistent decimal places
  formatValue: function (value, basePower = null) {
    // Handle variable power moves (basePower === 0)
    if (basePower === 0) {
      return "?";
    }

    // Round to 1 decimal place and ensure consistent formatting
    const rounded = Math.round(value / 1000) / 10;
    return rounded.toFixed(1);
  },

  addTooltipToElement: function (element, type, data, isTeamList = false) {
    const dataId = this.generateDataId();
    this.tooltipData[dataId] = data;

    if (isTeamList) {
      element.setAttribute(
        "onmouseover",
        `event.stopPropagation(); window.GuzztoolMantis.showTooltip(event, '${type}', '${dataId}')`
      );
      element.setAttribute(
        "onmouseout",
        `event.stopPropagation(); window.GuzztoolMantis.hideTooltip()`
      );
    } else {
      element.onmouseover = (event) => {
        event.stopPropagation();
        window.GuzztoolMantis.showTooltip(event, type, dataId);
      };
      element.onmouseout = (event) => {
        event.stopPropagation();
        window.GuzztoolMantis.hideTooltip();
      };
    }
  },

  getStats: function ({ pokemonSet, serverPokemon, clientPokemon }) {
    // If we're in battle and the setting is enabled, use modified stats
    if (this.shouldShowModifiedStatsInBattle() && room.battle && serverPokemon) {
      const modifiedStats = room.battle.scene.tooltips.calculateModifiedStats(clientPokemon, serverPokemon);
      this.log.debug(`Modified stats: ${JSON.stringify(modifiedStats)}`);
      return {
        hp: serverPokemon.maxhp,
        atk: modifiedStats.atk,
        def: modifiedStats.def,
        spa: modifiedStats.spa,
        spd: modifiedStats.spd,
      };
    }
    
    // Use raw stats from available sources
    if (serverPokemon?.stats) {
      return {
        hp: serverPokemon.maxhp,
        atk: serverPokemon.stats.atk,
        def: serverPokemon.stats.def,
        spa: serverPokemon.stats.spa,
        spd: serverPokemon.stats.spd,
      };
    }
    
    if (clientPokemon?.stats) {
      return {
        hp: clientPokemon.maxhp,
        atk: clientPokemon.stats.atk,
        def: clientPokemon.stats.def,
        spa: clientPokemon.stats.spa,
        spd: clientPokemon.stats.spd,
      };
    }
    
    // In teambuilder, use room.getStat and the PokemonSet
    if (pokemonSet && room.getStat) {
      return {
        hp: room.getStat("hp", pokemonSet),
        atk: room.getStat("atk", pokemonSet),
        def: room.getStat("def", pokemonSet),
        spa: room.getStat("spa", pokemonSet),
        spd: room.getStat("spd", pokemonSet),
      };
    }
    
    return null;
  },
};

export default subtool;
