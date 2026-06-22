const DATA_PATH = "./data/top5-data.json";
const STORAGE_KEY = "build-your-top-5-board";
const BODY_FONT = '"Cooper Black Local", "Cooper Black", Georgia, serif';
const DISPLAY_FONT = '"Basketball", serif';

const state = {
  data: null,
  picks: {},
  pickerQuery: {},
  openPicker: "",
};

const imageCache = new Map();

const boardRoot = document.querySelector("#draft-board");
const lotteryRoot = document.querySelector("#lottery-links");
const statusRoot = document.querySelector("#board-status");
const exportButton = document.querySelector("#export-board");
const resetButton = document.querySelector("#reset-board");
const pickTemplate = document.querySelector("#pick-template");

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function normalizeSearch(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function loadSavedPicks() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function savePicks() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.picks));
}

function setStatus(message) {
  statusRoot.textContent = message;
}

function selectedPlayerIds(excludedTeamId = "") {
  return new Set(
    Object.entries(state.picks)
      .filter(([teamId, playerId]) => teamId !== excludedTeamId && playerId)
      .map(([, playerId]) => playerId)
  );
}

function getPlayerById(playerId) {
  return state.data.players.find((player) => player.id === playerId) || null;
}

function makeInitials(name) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((piece) => piece[0]?.toUpperCase() || "");
  return letters.join("") || "?";
}

function playerMetaMarkup(player) {
  if (!player) {
    return `
      <div>
        <dt>School</dt>
        <dd>Open slot</dd>
      </div>
      <div>
        <dt>Pos</dt>
        <dd>Waiting</dd>
      </div>
      <div>
        <dt>Age</dt>
        <dd>Waiting</dd>
      </div>
    `;
  }

  return `
    <div>
      <dt>School</dt>
      <dd>${escapeHtml(player.school)}</dd>
    </div>
    <div>
      <dt>Pos</dt>
      <dd>${escapeHtml(player.pos)}</dd>
    </div>
    <div>
      <dt>Age</dt>
      <dd>${escapeHtml(player.age)}</dd>
    </div>
  `;
}

function photoMarkup(player, teamColor) {
  if (player?.headshot) {
    return `<img class="player-card__photo" src="${escapeHtml(player.headshot)}" alt="${escapeHtml(player.name)} headshot">`;
  }

  const label = player ? makeInitials(player.name) : "PK";
  return `<div class="player-card__photo player-card__photo--placeholder" style="color:${teamColor};">${escapeHtml(label)}</div>`;
}

function searchIndex(player) {
  return normalizeSearch(`${player.name} ${player.school} ${player.pos} ${player.age}`);
}

function availablePlayers(teamId) {
  const claimed = selectedPlayerIds(teamId);
  const currentId = state.picks[teamId] || "";

  return state.data.players
    .filter((player) => !claimed.has(player.id) || player.id === currentId)
    .sort((left, right) => {
      if (left.id === currentId) {
        return -1;
      }
      if (right.id === currentId) {
        return 1;
      }
      return left.rank - right.rank;
    });
}

function filteredPlayers(teamId) {
  const query = normalizeSearch(state.pickerQuery[teamId] || "");
  const pool = availablePlayers(teamId);

  if (!query) {
    return pool.slice(0, 10);
  }

  return pool.filter((player) => searchIndex(player).includes(query)).slice(0, 12);
}

function pickerResultsMarkup(teamId) {
  if (state.openPicker !== teamId) {
    return "";
  }

  const matches = filteredPlayers(teamId);
  const currentId = state.picks[teamId] || "";
  const hasPick = Boolean(currentId);

  const topRow = hasPick
    ? `
      <div class="pick-card__results-top">
        <button class="player-card__clear" type="button" data-clear-pick="${escapeHtml(teamId)}">Clear current pick</button>
      </div>
    `
    : "";

  if (!matches.length) {
    return `${topRow}<p class="pick-card__empty">No matching players.</p>`;
  }

  return `
    ${topRow}
    <div class="pick-card__results-list">
      ${matches
        .map((player) => {
          const currentClass = player.id === currentId ? " is-current" : "";
          return `
            <button
              class="pick-card__result${currentClass}"
              type="button"
              data-team-id="${escapeHtml(teamId)}"
              data-select-player="${escapeHtml(player.id)}"
            >
              <span class="pick-card__result-name">${escapeHtml(player.name)}</span>
              <span class="pick-card__result-meta">${escapeHtml(`${player.school} | ${player.pos} | Age ${player.age}`)}</span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderBoard() {
  boardRoot.innerHTML = "";

  for (const team of state.data.teams) {
    const fragment = pickTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".pick-card");
    const pickBadge = fragment.querySelector(".pick-card__badge");
    const teamLine = fragment.querySelector(".pick-card__team-line");
    const teamName = fragment.querySelector(".pick-card__team-name");
    const teamLogo = fragment.querySelector(".pick-card__logo");
    const searchInput = fragment.querySelector(".pick-card__search");
    const results = fragment.querySelector(".pick-card__results");
    const photoWrap = fragment.querySelector(".player-card__photo-wrap");
    const playerName = fragment.querySelector(".player-card__name");
    const playerMeta = fragment.querySelector(".player-card__meta");
    const clearButton = fragment.querySelector(".player-card__clear");

    const selectedId = state.picks[team.id] || "";
    const player = getPlayerById(selectedId);

    card.dataset.teamId = team.id;
    card.style.setProperty("--team-primary", team.primaryColor);
    pickBadge.textContent = `#${team.pick}`;
    teamLine.textContent = `Pick ${team.pick}`;
    teamName.textContent = `${team.city} ${team.name}`;
    teamLogo.src = team.logo;
    teamLogo.alt = `${team.city} ${team.name} logo`;

    searchInput.dataset.teamId = team.id;
    searchInput.id = `player-search-${team.id}`;
    searchInput.value = state.pickerQuery[team.id] || "";
    searchInput.setAttribute("aria-expanded", state.openPicker === team.id ? "true" : "false");
    searchInput.setAttribute("aria-controls", `player-results-${team.id}`);

    results.id = `player-results-${team.id}`;
    results.hidden = state.openPicker !== team.id;
    results.innerHTML = pickerResultsMarkup(team.id);

    photoWrap.innerHTML = photoMarkup(player, team.primaryColor);
    playerName.textContent = player ? player.name : "No pick yet";
    playerMeta.innerHTML = playerMetaMarkup(player);

    clearButton.dataset.teamId = team.id;
    clearButton.hidden = !player;

    boardRoot.appendChild(fragment);
  }
}

function refreshPickers() {
  for (const card of boardRoot.querySelectorAll(".pick-card")) {
    const teamId = card.dataset.teamId;
    const searchInput = card.querySelector(".pick-card__search");
    const results = card.querySelector(".pick-card__results");

    searchInput.value = state.pickerQuery[teamId] || "";
    searchInput.setAttribute("aria-expanded", state.openPicker === teamId ? "true" : "false");
    results.hidden = state.openPicker !== teamId;
    results.innerHTML = pickerResultsMarkup(teamId);
  }
}

function applyPick(teamId, playerId) {
  state.picks[teamId] = playerId;
  state.pickerQuery[teamId] = "";
  state.openPicker = "";
  savePicks();
  renderBoard();
  setStatus("Board updated.");
}

function clearPick(teamId) {
  delete state.picks[teamId];
  state.pickerQuery[teamId] = "";
  state.openPicker = "";
  savePicks();
  renderBoard();
  setStatus("Pick cleared.");
}

function renderLotteryLinks() {
  if (!state.data.lotteryLinks.length) {
    lotteryRoot.innerHTML = '<li class="lottery-links__empty">No video links were found in the source document.</li>';
    return;
  }

  lotteryRoot.innerHTML = state.data.lotteryLinks
    .map(
      (entry) => `
        <li>
          <a href="${escapeHtml(entry.url)}" target="_blank" rel="noreferrer">
            <span>${escapeHtml(entry.name)}</span>
          </a>
        </li>
      `
    )
    .join("");
}

function drawCircleImage(ctx, image, x, y, size) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
}

function fitFont(ctx, text, maxWidth, size, family) {
  let current = size;
  while (current > 18) {
    ctx.font = `${current}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) {
      return current;
    }
    current -= 2;
  }
  return current;
}

function wrapTextLines(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }
    current = word;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  if (current) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let lastLine = lines[maxLines - 1];
    while (ctx.measureText(`${lastLine}...`).width > maxWidth && lastLine.length > 0) {
      lastLine = lastLine.slice(0, -1).trimEnd();
    }
    lines[maxLines - 1] = `${lastLine}...`;
  }

  return lines;
}

function coverImage(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const dx = x + (width - drawWidth) / 2;
  const dy = y + (height - drawHeight) / 2;
  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);
}

function drawRect(ctx, x, y, width, height, fillStyle, strokeStyle, lineWidth = 1) {
  ctx.fillStyle = fillStyle;
  ctx.fillRect(x, y, width, height);
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(x, y, width, height);
  }
}

async function loadImage(src) {
  if (!src) {
    return null;
  }

  if (!imageCache.has(src)) {
    imageCache.set(
      src,
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      })
    );
  }

  return imageCache.get(src);
}

function drawRowPlaceholder(ctx, team, x, y, size, text) {
  ctx.fillStyle = "#e6dfd1";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = team.primaryColor;
  ctx.font = `32px ${DISPLAY_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(text, x + size / 2, y + size / 2 + 10);
  ctx.textAlign = "left";
}

async function buildExportCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1200;
  const ctx = canvas.getContext("2d");

  await document.fonts.ready;
  const background = await loadImage("assets/images/all-nba-background.jpg").catch(() => null);
  if (background) {
    coverImage(ctx, background, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#efebe2";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const footerImage = await loadImage("assets/images/watchlistenjpg.jpg").catch(() => null);
  const footerHeight = footerImage ? 163 : 0;
  const footerY = canvas.height - footerHeight;
  const contentBottom = footerY - 20;
  const cardX = 38;
  const cardW = canvas.width - 76;
  const cardGap = 12;
  const firstCardY = 170;
  const cardH = Math.floor((contentBottom - firstCardY - cardGap * 4) / 5);
  const logoSize = 128;
  const titleFontSize = 130;

  const allCityLogo = await loadImage("assets/images/all-nba-logo.png").catch(() => null);
  ctx.font = `${titleFontSize}px ${DISPLAY_FONT}`;
  const titleText = "BUILD YOUR TOP 5";
  const titleWidth = ctx.measureText(titleText).width;
  const titleGroupWidth = logoSize + 24 + titleWidth;
  const titleStartX = (canvas.width - titleGroupWidth) / 2;
  const titleBaselineY = 128;

  if (allCityLogo) {
    ctx.drawImage(allCityLogo, titleStartX, 18, logoSize, logoSize);
  }

  ctx.fillStyle = "#1d2430";
  ctx.textAlign = "left";
  ctx.fillText(titleText, titleStartX + logoSize + 24, titleBaselineY);

  for (const team of state.data.teams) {
    const rowY = firstCardY + (team.pick - 1) * (cardH + cardGap);
    const player = getPlayerById(state.picks[team.id]);
    const logo = await loadImage(team.logo).catch(() => null);
    const headshot = player?.headshot ? await loadImage(player.headshot).catch(() => null) : null;
    const badgeSize = 90;
    const badgeX = cardX + 30;
    const badgeY = rowY + Math.round((cardH - badgeSize) / 2);
    const teamLogoSize = 60;
    const teamLogoX = badgeX + badgeSize + 24;
    const teamLogoY = rowY + Math.round((cardH - teamLogoSize) / 2);
    const playerBandX = teamLogoX + teamLogoSize + 20;
    const playerBandY = rowY + Math.round((cardH - 88) / 2);
    const playerBandH = 88;
    const playerBandW = 560;
    const playerHeadshotSize = 82;
    const playerHeadshotX = playerBandX + 12;
    const playerHeadshotY = rowY + Math.round((cardH - playerHeadshotSize) / 2);
    const playerTextX = playerHeadshotX + playerHeadshotSize + 28;
    const playerNameWidth = playerBandW - (playerTextX - playerBandX) - 22;

    drawRect(ctx, cardX, rowY, cardW, cardH, "rgba(255, 252, 246, 0.92)", "rgba(29, 36, 48, 0.14)", 2);

    ctx.fillStyle = team.primaryColor;
    ctx.fillRect(cardX, rowY, 14, cardH);
    ctx.fillRect(badgeX, badgeY, badgeSize, badgeSize);

    ctx.fillStyle = "#ffffff";
    ctx.font = `40px ${DISPLAY_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(`#${team.pick}`, badgeX + badgeSize / 2, badgeY + 62);
    ctx.textAlign = "left";

    if (logo) {
      ctx.drawImage(logo, teamLogoX, teamLogoY, teamLogoSize, teamLogoSize);
    }

    drawRect(
      ctx,
      playerBandX,
      playerBandY,
      playerBandW,
      playerBandH,
      "rgba(249, 246, 238, 0.82)",
      null,
      0
    );

    if (player) {
      if (headshot) {
        drawCircleImage(ctx, headshot, playerHeadshotX, playerHeadshotY, playerHeadshotSize);
      } else {
        drawRowPlaceholder(ctx, team, playerHeadshotX, playerHeadshotY, playerHeadshotSize, makeInitials(player.name));
      }

      const playerFontSize = fitFont(ctx, player.name, playerNameWidth, 58, BODY_FONT);
      ctx.fillStyle = "#1d2430";
      ctx.font = `${playerFontSize}px ${BODY_FONT}`;
      const playerLines = wrapTextLines(ctx, player.name, playerNameWidth, 1);
      playerLines.forEach((line, index) => {
        ctx.fillText(line, playerTextX, rowY + 78 + index * 40);
      });

      const metaText = `${player.school} | ${player.pos} | Age ${player.age}`;
      const metaFontSize = fitFont(ctx, metaText, playerNameWidth, 26, BODY_FONT);
      ctx.fillStyle = "#635d55";
      ctx.font = `${metaFontSize}px ${BODY_FONT}`;
      ctx.fillText(metaText, playerTextX, rowY + 116);
    } else {
      drawRowPlaceholder(ctx, team, playerHeadshotX, playerHeadshotY, playerHeadshotSize, "PK");
      ctx.fillStyle = "#1d2430";
      ctx.font = `52px ${BODY_FONT}`;
      ctx.fillText("No pick yet", playerTextX, rowY + 78);
      ctx.fillStyle = "#635d55";
      ctx.font = `24px ${BODY_FONT}`;
      ctx.fillText("Make your selection on the board.", playerTextX, rowY + 116);
    }
  }

  if (footerImage) {
    ctx.drawImage(footerImage, 0, footerY, canvas.width, footerHeight);
  }

  return canvas;
}

async function exportBoardAsPng() {
  if (!state.data) {
    return;
  }

  setStatus("Building PNG...");
  const canvas = await buildExportCanvas();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "build-your-top-5.png";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("PNG exported.");
}

function resetBoard() {
  state.picks = {};
  state.pickerQuery = {};
  state.openPicker = "";
  savePicks();
  renderBoard();
  setStatus("Board cleared.");
}

async function init() {
  try {
    const response = await fetch(DATA_PATH);
    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    state.data = await response.json();
    state.picks = loadSavedPicks();
    renderBoard();
    renderLotteryLinks();
  } catch (error) {
    boardRoot.innerHTML = "<p>Draft board data could not be loaded.</p>";
    lotteryRoot.innerHTML = '<li class="lottery-links__empty">Links could not be loaded.</li>';
    setStatus("The page could not load its draft data.");
    return;
  }

  boardRoot.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches(".pick-card__search")) {
      return;
    }

    state.openPicker = target.dataset.teamId || "";
    refreshPickers();
  });

  boardRoot.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches(".pick-card__search")) {
      return;
    }

    const teamId = target.dataset.teamId || "";
    state.pickerQuery[teamId] = target.value;
    state.openPicker = teamId;
    refreshPickers();
  });

  boardRoot.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches(".pick-card__search")) {
      return;
    }

    const teamId = target.dataset.teamId || "";

    if (event.key === "Escape") {
      state.openPicker = "";
      refreshPickers();
      return;
    }

    if (event.key === "Enter") {
      const matches = filteredPlayers(teamId);
      if (!matches.length) {
        return;
      }
      event.preventDefault();
      applyPick(teamId, matches[0].id);
    }
  });

  boardRoot.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const resultButton = target.closest("[data-select-player]");
    if (resultButton) {
      applyPick(resultButton.dataset.teamId, resultButton.dataset.selectPlayer);
      return;
    }

    const inlineClear = target.closest("[data-clear-pick]");
    if (inlineClear) {
      clearPick(inlineClear.dataset.clearPick);
      return;
    }

    const clearButton = target.closest(".player-card__clear");
    if (clearButton && clearButton.dataset.teamId) {
      clearPick(clearButton.dataset.teamId);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Node) || boardRoot.contains(target)) {
      return;
    }

    if (!state.openPicker) {
      return;
    }

    state.openPicker = "";
    refreshPickers();
  });

  exportButton.addEventListener("click", exportBoardAsPng);
  resetButton.addEventListener("click", resetBoard);
}

window.__buildTopFiveExportPreview = async () => {
  const canvas = await buildExportCanvas();
  return canvas.toDataURL("image/png");
};

init();
