/* ============================================================
   SUPABASE : INIT
   ============================================================ */

const SUPABASE_ANON_KEY = "sb_publishable_5dLGMNbcTZoT3_ixNE9XyA_Er8hV5Vb";

const supa = window.supabase.createClient(
  "https://gjzqghhqpycbcwykxvgw.supabase.co",
  SUPABASE_ANON_KEY
);


/* ============================================================
   PROFIL : ÉTAT LOCAL
   ============================================================ */

function updateUIForLoggedOutUser() {
    const btn = document.getElementById("btnUser");
    if (!btn) return;

    btn.textContent = "Se connecter";
    btn.classList.remove("logged-in");
    btn.classList.add("logged-out");
}

function updateUIForLoggedInUser(user) {
    const btn = document.getElementById("btnUser");
    if (!btn) return;

    btn.classList.remove("logged-out");
    btn.classList.add("logged-in");

    btn.innerHTML = `
        <img src="${user.avatarUrl}" class="avatar-mini">
        <span>${user.pseudo}</span>
    `;
}


/* ============================================================
   PROFIL : INIT SESSION AU DÉMARRAGE
   ============================================================ */

async function initUserSession() {

    const storedUser = JSON.parse(localStorage.getItem("user"));

    if (!storedUser) {
        updateUIForLoggedOutUser();
        return;
    }

    const session = supa.auth.session();

    if (!session || !session.user) {
        localStorage.removeItem("user");
        updateUIForLoggedOutUser();
        return;
    }

    updateUIForLoggedInUser(storedUser);
}

initUserSession();


/* ============================================================
   PROFIL : OUVERTURE / FERMETURE DU BLOC
   ============================================================ */

const btnUser = document.getElementById("btnUser");
const profileBlock = document.getElementById("profileBlock");

function openProfileBlock() {
    profileBlock.classList.remove("closed");
    profileBlock.classList.add("open");

    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) return;

    document.getElementById("profilePseudo").textContent = user.pseudo;
    document.getElementById("profileEmail").textContent = user.email;
    document.getElementById("profileAvatarLarge").style.backgroundImage =
        `url('${user.avatarUrl}')`;

    document.getElementById("profileView1").classList.add("active");
    document.getElementById("profileView2").classList.remove("active");
}

function closeProfileBlock() {
    profileBlock.classList.remove("open");
    profileBlock.classList.add("closed");
}


/* ============================================================
   PROFIL : BOUTON UTILISATEUR
   ============================================================ */

btnUser.addEventListener("click", () => {

    const storedUser = JSON.parse(localStorage.getItem("user"));

    if (!storedUser) {
        openLoginWindow();
        return;
    }

    if (profileBlock.classList.contains("open")) {
        closeProfileBlock();
    } else {
        openProfileBlock();
    }
});


/* ============================================================
   PROFIL : OUVERTURE LOGIN
   ============================================================ */

function openLoginWindow() {
    document.getElementById("authOverlay").classList.remove("hidden");
}


/* ============================================================
   PROFIL : BASCULE VUE 1 ↔ VUE 2
   ============================================================ */

document.getElementById("btnEditProfile").addEventListener("click", () => {

    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) return;

    document.getElementById("inputPseudo").value = user.pseudo;
    document.getElementById("inputEmail").value = user.email;
    document.getElementById("editAvatarLarge").style.backgroundImage =
        `url('${user.avatarUrl}')`;

    document.getElementById("profileView1").classList.remove("active");
    document.getElementById("profileView2").classList.add("active");
});

document.getElementById("btnCancelEdit").addEventListener("click", () => {
    document.getElementById("profileView2").classList.remove("active");
    document.getElementById("profileView1").classList.add("active");
});


/* ============================================================
   PROFIL : ENREGISTREMENT MODIFICATIONS
   ============================================================ */

document.getElementById("btnSaveProfile").addEventListener("click", async () => {

    const errorMessage = document.getElementById("profileErrorMessage");
    errorMessage.textContent = "";

    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) return;

    const newPseudo = document.getElementById("inputPseudo").value.trim();
    const newEmail = document.getElementById("inputEmail").value.trim();
    const newPassword = document.getElementById("inputPasswordNew").value.trim();
    const confirmPassword = document.getElementById("inputPasswordConfirm").value.trim();

    if (!newPseudo) {
        errorMessage.textContent = "Le pseudo ne peut pas être vide.";
        return;
    }

    if (!newEmail) {
        errorMessage.textContent = "L’email ne peut pas être vide.";
        return;
    }

    if (newPassword && newPassword !== confirmPassword) {
        errorMessage.textContent = "Les mots de passe ne correspondent pas.";
        return;
    }

    if (newEmail !== user.email || newPassword) {

        const updatePayload = {};
        if (newEmail !== user.email) updatePayload.email = newEmail;
        if (newPassword) updatePayload.password = newPassword;

        const { error: authError } = await supa.auth.update(updatePayload);

        if (authError) {
            errorMessage.textContent = authError.message;
            return;
        }
    }

    if (newPseudo !== user.pseudo) {
        const { error: pseudoError } = await supa
            .from("players")
            .update({ pseudo: newPseudo })
            .eq("id", user.id);

        if (pseudoError) {
            errorMessage.textContent = pseudoError.message;
            return;
        }
    }

    const updatedUser = {
        ...user,
        pseudo: newPseudo,
        email: newEmail
    };

    localStorage.setItem("user", JSON.stringify(updatedUser));

    document.getElementById("profilePseudo").textContent = newPseudo;
    document.getElementById("profileEmail").textContent = newEmail;

    document.getElementById("profileView2").classList.remove("active");
    document.getElementById("profileView1").classList.add("active");

    updateUIForLoggedInUser(updatedUser);
});


/* ============================================================
   PROFIL : UPLOAD AVATAR
   ============================================================ */

document.getElementById("inputAvatar").addEventListener("change", async () => {

    const file = document.getElementById("inputAvatar").files[0];
    if (!file) return;

    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) return;

    const path = `avatars/${user.id}.png`;

    const { error: uploadError } = await supa.storage
        .from("avatars")
        .upload(path, file, { upsert: true });

    if (uploadError) {
        document.getElementById("profileErrorMessage").textContent = uploadError.message;
        return;
    }

    const { data } = supa.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = data.publicUrl;

    await supa
        .from("players")
        .update({ avatar_url: avatarUrl })
        .eq("id", user.id);

    const updatedUser = { ...user, avatarUrl };
    localStorage.setItem("user", JSON.stringify(updatedUser));

    document.getElementById("editAvatarLarge").style.backgroundImage = `url('${avatarUrl}')`;
    document.getElementById("profileAvatarLarge").style.backgroundImage = `url('${avatarUrl}')`;

    updateUIForLoggedInUser(updatedUser);
});


/* ============================================================
   PROFIL : DÉCONNEXION
   ============================================================ */

document.getElementById("btnLogout").addEventListener("click", async () => {

    await supa.auth.signOut();

    localStorage.removeItem("user");

    updateUIForLoggedOutUser();

    closeProfileBlock();
});


/* ============================================================
   PROFIL : CLIC EXTÉRIEUR
   ============================================================ */

document.addEventListener("click", (event) => {

    if (!profileBlock.classList.contains("open")) return;

    if (btnUser.contains(event.target)) return;
    if (profileBlock.contains(event.target)) return;

    closeProfileBlock();
});

/* ============================================================
   LEADERBOARD : FETCH
   ============================================================ */

async function fetchLeaderboard() {
  const response = await fetch(
    "https://gjzqghhqpycbcwykxvgw.supabase.co/rest/v1/scores?select=score,duration_ms,undo_count,jokers_used,created_at,players(id,pseudo)&order=score.desc,duration_ms.asc,undo_count.asc,jokers_used.asc&limit=100",
    {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );

  return await response.json();
}

async function fetchPlayerScores(userId) {
  const response = await fetch(
    `https://gjzqghhqpycbcwykxvgw.supabase.co/rest/v1/scores?player_id=eq.${userId}&select=*`,
    {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );

  return await response.json();
}


/* ============================================================
   LEADERBOARD : FORMATTERS
   ============================================================ */

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function truncatePseudo(pseudo) {
  return pseudo.length > 12 ? pseudo.slice(0, 12) + "…" : pseudo;
}

function formatDate(value) {
  if (!value) return "";
  const normalized = value.replace(" ", "T");
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR");
}


/* ============================================================
   LEADERBOARD : HEADER
   ============================================================ */

function renderLeaderboardHeader(isLoggedIn) {
  const title = document.getElementById("leaderboardTitle");
  const hintContainer = document.querySelector(".leaderboard-hint");

  if (!title || !hintContainer) return;

  title.textContent = "Leaderboard";

  if (!isLoggedIn) {
    hintContainer.textContent = "Si tu veux voir tes scores, inscris‑toi 🙂";
    hintContainer.style.display = "block";
  } else {
    hintContainer.style.display = "none";
  }
}


/* ============================================================
   LEADERBOARD : RENDER
   ============================================================ */

function renderLeaderboard(list, isLoggedIn, userId = null) {
  renderLeaderboardHeader(isLoggedIn);

  const container = document.getElementById("leaderboardContainer");
  if (!container) return;

  container.innerHTML = "";

  let bestIndex = null;
  if (userId) {
    bestIndex = list.findIndex(entry => entry.players?.id === userId);
  }

  const header = document.createElement("div");
  header.className = "leaderboard-row leaderboard-header";
  header.innerHTML = `
    <span class="rank">#</span>
    <span class="pseudo">Pseudo</span>
    <span class="score">🏆</span>
    <span class="duration">⏱️</span>
    <span class="undo">↩️</span>
    <span class="jokers">🃏</span>
    <span class="date">📅</span>
  `;
  container.appendChild(header);

  list.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "leaderboard-row";

    const pseudo = truncatePseudo(entry.players?.pseudo ?? "???");
    const date = formatDate(entry.created_at);

    row.innerHTML = `
      <span class="rank">${index + 1}</span>
      <span class="pseudo">${pseudo}</span>
      <span class="score">${entry.score}</span>
      <span class="duration">${formatDuration(entry.duration_ms)}</span>
      <span class="undo">${entry.undo_count}</span>
      <span class="jokers">${entry.jokers_used}</span>
      <span class="date">${date}</span>
    `;

    if (index === bestIndex) {
      row.classList.add("my-best-score");
    }

    container.appendChild(row);
  });
}


/* ============================================================
   LEADERBOARD : OUVERTURE / FERMETURE
   ============================================================ */

document.getElementById("burgerLeaderboardBtn").addEventListener("click", async () => {
  playClickSound();
  pauseGame();

  const overlay = document.getElementById("leaderboardOverlay");
  overlay.classList.remove("hidden");

  const user = supa.auth.user();
  const isLoggedIn = !!user;

  const list = await fetchLeaderboard();
  renderLeaderboard(list, isLoggedIn, user?.id || null);
});

function closeLeaderboard() {
  document.getElementById("leaderboardOverlay").classList.add("hidden");
}

document.getElementById("closeLeaderboardBtn").addEventListener("click", () => {
  playClickSound();
  closeLeaderboard();
});


/* ============================================================
   LEADERBOARD : MODAL BEHAVIOR
   ============================================================ */

const leaderboardOverlay = document.getElementById("leaderboardOverlay");
const leaderboardPanel = leaderboardOverlay.querySelector(".leaderboard-panel");

leaderboardOverlay.addEventListener("click", (e) => {
  if (e.target === leaderboardOverlay) {
    playClickSound();
    closeLeaderboard();
  }
});

leaderboardPanel.addEventListener("click", (e) => e.stopPropagation());


/* ============================================================
   BEST SCORE : LOCAL STORAGE
   ============================================================ */

function saveBestScore(data) {
  try {
    localStorage.setItem("bestScoreData", JSON.stringify(data));
  } catch(e) {
    console.error("Erreur sauvegarde meilleur score :", e);
  }
}

function loadBestScore() {
  try {
    const raw = localStorage.getItem("bestScoreData");
    return raw ? JSON.parse(raw) : null;
  } catch(e) {
    console.error("Erreur chargement meilleur score :", e);
    return null;
  }
}


/* ============================================================
   BEST SCORE : TOP BAR
   ============================================================ */

function updateBestScoreTop() {
  const el = document.getElementById("bestScoreTop");
  if (!el) return;

  const best = loadBestScore();
  if (!best || isNaN(Number(best.score))) {
    el.textContent = "";
    return;
  }

  const score = Number(best.score);
  const minutes = Math.floor(best.duration / 60);
  const seconds = best.duration % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  el.innerHTML =
    `<span class="emoji">🏆</span> ${score} lignes ` +
    `<span class="emoji">↩️</span>${best.returnsUsed} ` +
    `<span class="emoji">🃏</span>${best.jokersUsed} ` +
    `<span class="emoji">⏱️</span>${timeStr}`;
}


/* ============================================================
   BEST SCORE : PANEL
   ============================================================ */

function showBestScorePanel() {
  const panel = document.getElementById("bestScoreContent");
  if (!panel) return;

  const best = loadBestScore();
  if (!best) {
    panel.innerHTML = "<p>Aucun record enregistré pour le moment.</p>";
  } else {
    const score = Number(best.score);
    const minutes = Math.floor(best.duration / 60);
    const seconds = best.duration % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

    panel.innerHTML = `
      <div class="record-line">
        🏆 ${score} lignes — ${best.returnsUsed} retour${best.returnsUsed > 1 ? "s" : ""} — ${best.jokersUsed} joker${best.jokersUsed > 1 ? "s" : ""} — ${timeStr}
      </div>
    `;
  }

  document.getElementById("bestScoreOverlay").classList.remove("hidden");
}

document.getElementById("closeBestScore").addEventListener("click", () => {
  document.getElementById("bestScoreOverlay").classList.add("hidden");
});


/* ============================================================
   SOUND BUTTON
   ============================================================ */

function updateSoundButton() {
  const btn = document.getElementById("burgerSoundBtn");
  btn.textContent = soundEnabled ? "Son : on" : "Son : off";
}

/* ============================================================
   SAUVEGARDE PARTIE
   ============================================================ */

function saveGameState() {
  if (tutorialRunning) return;

  const data = {
    activePoints: Array.from(activePoints),
    permanentPoints: Array.from(permanentPoints),
    usedEdges: Array.from(usedEdges),
    validatedSegments,
    historyStack: JSON.parse(JSON.stringify(validatedSegments)),
    score,
    jokersAvailable,
    jokersTotal,
    undoCount,
    timerSeconds,
    gameOver,
    soundEnabled,
    paused
  };

  try {
    localStorage.setItem("currentGameState", JSON.stringify(data));
  } catch (e) {
    console.error("Erreur sauvegarde partie :", e);
  }
}

function loadGameState() {
  try {
    const raw = localStorage.getItem("currentGameState");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("Erreur chargement partie :", e);
    return null;
  }
}

function restoreGameState() {
  const data = loadGameState();
  if (!data) return false;

  if (!Array.isArray(data.activePoints) ||
      !Array.isArray(data.permanentPoints) ||
      !Array.isArray(data.validatedSegments) ||
      data.activePoints.length === 0 ||
      data.permanentPoints.length === 0) {
    return false;
  }

  activePoints = new Set(data.activePoints);
  permanentPoints = new Set(data.permanentPoints);
  usedEdges = new Set(data.usedEdges || []);
  validatedSegments = [...data.validatedSegments];

  score = data.score ?? 0;
  jokersAvailable = data.jokersAvailable ?? 0;
  jokersTotal = data.jokersTotal ?? 0;
  undoCount = data.undoCount ?? 0;
  timerSeconds = data.timerSeconds ?? 0;

  gameOver = data.gameOver ?? false;
  paused = data.paused ?? false;

  historyStack = data.historyStack ? [...data.historyStack] : [];

  const historyList = document.getElementById("historyList");
  historyList.innerHTML = "";
  historyStack.forEach(entry => {
    appendHistoryEntry(entry.points, entry.activeCount);
  });

  soundEnabled = data.soundEnabled ?? true;
  updateSoundButton();

  return true;
}

window.addEventListener("beforeunload", saveGameState);


/* ============================================================
   AUDIO
   ============================================================ */

function playClickSound() { if (!soundEnabled) return; const a=document.getElementById("clickSound"); a.currentTime=0; a.play(); }
function playErrorSound() { if (!soundEnabled) return; const a=document.getElementById("errorSound"); a.currentTime=0; a.play(); }
function playSuccessSound() { if (!soundEnabled) return; const a=document.getElementById("successSound"); a.currentTime=0; a.play(); }
function playTutorialSound() { if (!soundEnabled) return; const a=document.getElementById("tutorialSound"); a.currentTime=0; a.play(); }
function playJokerGainSound() { if (!soundEnabled) return; const a=document.getElementById("jokerSound"); a.currentTime=0; a.play(); }
function playJokerLossSound() { if (!soundEnabled) return; const a=document.getElementById("jokerLossSound"); a.currentTime=0; a.play(); }
function playEndGameSound() { if (!soundEnabled) return; const a=document.getElementById("endGameSound"); a.currentTime=0; a.play(); }
function playStartGameSound() { if (!soundEnabled) return; const a=document.getElementById("startGameSound"); a.currentTime=0; a.play(); }
function playNewRecordSound() { if (!soundEnabled) return; const a=document.getElementById("newRecordSound"); if (a) a.play(); }

function unlockAudio() {
  const ids = ["clickSound"];
  ids.forEach(id => {
    const a = document.getElementById(id);
    a.volume = 0.001;
    a.play().then(() => {
      setTimeout(() => { a.pause(); a.currentTime = 0; a.volume = 1; }, 30);
    }).catch(()=>{});
  });
}


/* ============================================================
   UI UTILITAIRES
   ============================================================ */

function flash(message, type = "") {
  const div = document.createElement("div");
  div.className = "flashMessage " + type;
  div.textContent = message;
  document.getElementById("flashContainer").appendChild(div);
  requestAnimationFrame(() => div.classList.add("show"));
  setTimeout(() => { 
    div.classList.remove("show"); 
    setTimeout(() => div.remove(), 300); 
  }, 1500);
}

function showTutorialBubble(text, icon = "") {
  const bubble = document.getElementById("tutorialBubble");
  bubble.innerHTML = icon ? `<span style="margin-right:6px;">${icon}</span>${text}` : text;
  bubble.style.display = "block";
  requestAnimationFrame(() => bubble.style.opacity = "1");
}

function hideTutorialBubble() {
  const bubble = document.getElementById("tutorialBubble");
  bubble.style.opacity = "0";
  setTimeout(() => bubble.style.display = "none", 300);
}

function updateCounters() {
  document.getElementById("scoreValue").textContent = score;
  document.getElementById("jokersCombinedValue").textContent = `${jokersAvailable} / ${jokersTotal}`;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}


/* ============================================================
   TIMER
   ============================================================ */

function startTimer() {
  if (timerInterval) return;
  timerRunning = true;
  timerInterval = setInterval(() => {
    timerSeconds++;
    autoSave();
    document.getElementById("timerValue").textContent = formatTime(timerSeconds);
  }, 1000);
}

function stopTimer() {
  if (!timerInterval) return;
  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;
}

function resetTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerSeconds = 0;
  timerRunning = false;
  document.getElementById("timerValue").textContent = "00:00";
}


/* ============================================================
   GRILLE + DESSIN
   ============================================================ */

function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#ddd";
  ctx.lineWidth = 1;

  for (let y = 0; y < size; y++) {
    ctx.beginPath();
    ctx.moveTo(offset, offset + y * spacing);
    ctx.lineTo(offset + (size - 1) * spacing, offset + y * spacing);
    ctx.stroke();
  }

  for (let x = 0; x < size; x++) {
    ctx.beginPath();
    ctx.moveTo(offset + x * spacing, offset);
    ctx.lineTo(offset + x * spacing, offset + (size - 1) * spacing);
    ctx.stroke();
  }
}

function drawPoint(x, y, color = "#000") {
  ctx.beginPath();
  ctx.arc(offset + x * spacing, offset + y * spacing, 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawSegment(segmentPoints) {
  const [sx, sy] = segmentPoints[0].split(",").map(Number);
  const [ex, ey] = segmentPoints[4].split(",").map(Number);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(offset + sx * spacing, offset + sy * spacing);
  ctx.lineTo(offset + ex * spacing, offset + ey * spacing);
  ctx.stroke();
}


/* ============================================================
   SNAP + POINT LE PLUS PROCHE
   ============================================================ */

function getNearestPoint(mx, my) {
  let best = null;
  let bestDist = Infinity;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = offset + x * spacing;
      const py = offset + y * spacing;

      const dx = mx - px;
      const dy = my - py;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist < bestDist) {
        bestDist = dist;
        best = { x, y };
      }
    }
  }

  return bestDist <= 15 ? best : null;
}

function snapToAlignedPoint(first, clicked, mx, my) {
  const { x: x1, y: y1 } = first;
  const { x: x2, y: y2 } = clicked;

  if (x1 === x2 || y1 === y2 || Math.abs(x1 - x2) === Math.abs(y1 - y2)) {
    return clicked;
  }

  const candidates = [];

  candidates.push({ x: x1, y: y2 });
  candidates.push({ x: x2, y: y1 });

  const dx = x2 - x1;
  const dy = y2 - y1;
  const signX = dx > 0 ? 1 : -1;
  const signY = dy > 0 ? 1 : -1;

  candidates.push({ x: x1 + Math.abs(dy) * signX, y: y1 + Math.abs(dy) * signY });
  candidates.push({ x: x1 + Math.abs(dx) * signY, y: y1 + Math.abs(dx) * signX });

  let best = clicked;
  let bestDist = Infinity;

  for (const c of candidates) {
    const px = offset + c.x * spacing;
    const py = offset + c.y * spacing;
    const dist = Math.hypot(mx - px, my - py);

    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }

  return bestDist <= 15 ? best : clicked;
}

/* ============================================================
   CROIX DE MALTE
   ============================================================ */

function drawMaltaCross() {
  permanentPoints.forEach(key => {
    const [x, y] = key.split(",").map(Number);
    drawPoint(x, y);
  });
}

function initMaltaCross() {

  permanentPoints.clear();
  activePoints.clear();

  let x = 0, y = 0;
  const pts = [];
  const add = (px, py) => pts.push({ x: px, y: py });
  add(x, y);

  const steps = [
    [1,0,3],[0,1,3],[1,0,3],[0,1,3],
    [-1,0,3],[0,1,3],[-1,0,3],[0,-1,3],
    [-1,0,3],[0,-1,3],[1,0,3],[0,-1,3]
  ];

  for (const [dx, dy, n] of steps) {
    for (let i = 0; i < n; i++) {
      x += dx;
      y += dy;
      add(x, y);
    }
  }

  const refX = -3;
  const refY = 3;

  const targetLeftX = 12;
  const targetLeftY = 15;

  const offsetX = targetLeftX - refX;
  const offsetY = targetLeftY - refY;

  pts.forEach(p => {
    const key = `${p.x + offsetX},${p.y + offsetY}`;
    permanentPoints.add(key);
    activePoints.add(key);
  });
}

function redrawEverything() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawGrid();

  validatedSegments.forEach(seg => drawSegment(seg.points));

  activePoints.forEach(key => {
    const [x, y] = key.split(",").map(Number);
    drawPoint(x, y);
  });
}


/* ============================================================
   ARÊTES
   ============================================================ */

function edgeKey(a, b) {
  return (a < b) ? `${a}|${b}` : `${b}|${a}`;
}

function edgesOfSegment(segmentKeys) {
  const edges = [];
  for (let i = 0; i < 4; i++) edges.push(edgeKey(segmentKeys[i], segmentKeys[i+1]));
  return edges;
}


/* ============================================================
   JOKERS
   ============================================================ */

function gainJoker() {
  jokersAvailable++;
  jokersTotal++;
  autoSave();
  updateCounters();

  const container = document.getElementById("jokerEffectContainer");
  const float = document.createElement("div");
  float.className = "joker-float";
  float.textContent = "+1";
  float.style.left = (canvas.width / 2 - 10) + "px";
  float.style.top  = (canvas.height / 2 - 20) + "px";
  container.appendChild(float);
  setTimeout(() => container.removeChild(float), 1000);

  playJokerGainSound();
}

function loseJoker(amount) {
  jokersAvailable -= amount;
  updateCounters();

  const container = document.getElementById("jokerEffectContainer");
  const float = document.createElement("div");
  float.className = "joker-loss";
  float.textContent = `-${amount}`;
  float.style.left = (canvas.width / 2 - 12) + "px";
  float.style.top  = (canvas.height / 2 - 20) + "px";
  container.appendChild(float);
  setTimeout(() => container.removeChild(float), 1000);

  playJokerLossSound();
}


/* ============================================================
   VALIDATION D’UN SEGMENT
   ============================================================ */

function getSegmentBetween(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  const aligned =
    (dx === 0 && Math.abs(dy) === 4) ||
    (dy === 0 && Math.abs(dx) === 4) ||
    (Math.abs(dx) === 4 && Math.abs(dy) === 4);

  if (!aligned) { 
    flash("Impossible : Points non alignés", "error"); 
    playErrorSound(); 
    return null; 
  }

  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);

  const segment = [];
  for (let i = 0; i < 5; i++) {
    segment.push(`${start.x + i * stepX},${start.y + i * stepY}`);
  }

  const edges = edgesOfSegment(segment);
  if (edges.some(e => usedEdges.has(e))) {
    flash("Impossible : segment déjà utilisé", "error");
    playErrorSound();
    return null;
  }

  const activeCount = segment.filter(p => activePoints.has(p)).length;

  if (activeCount < 2) {
    flash("Impossible : au moins 2 points actifs nécessaires", "error");
    playErrorSound();
    return null;
  }

  if (activeCount === 5) { 
    gainJoker(); 
    flash("+ 1 joker", "success"); 
    playSuccessSound(); 
  }
  else if (activeCount === 3) {
    if (jokersAvailable >= 1) { 
      loseJoker(1); 
      flash("- 1 joker", "info"); 
    }
    else { 
      flash("Impossible : pas de joker", "error"); 
      playErrorSound(); 
      return null; 
    }
  }
  else if (activeCount === 2) {
    if (jokersAvailable >= 2) { 
      loseJoker(2); 
      flash("- 2 jokers", "info"); 
    }
    else { 
      flash("Impossible : 2 jokers nécessaires", "error"); 
      return null; 
    }
  }

  segment.forEach(key => {
    if (!activePoints.has(key)) {
      activePoints.add(key);
      const [px, py] = key.split(",").map(Number);
      drawPoint(px, py);
    }
  });

  edges.forEach(e => usedEdges.add(e));

  return { points: segment, edges, activeCount };
}


/* ============================================================
   HISTORIQUE
   ============================================================ */

function appendHistoryEntry(points, activeCount) {
  const historyList = document.getElementById("historyList");
  const li = document.createElement("li");

  const displayed = points.map(p => {
    const [x, y] = p.split(",").map(Number);
    return `${x + 1},${y + 1}`;
  });

  li.textContent = displayed.join(" → ");

  if (activeCount === 5) li.className = "gain";
  else if (activeCount === 3 || activeCount === 2) li.className = "loss";
  else li.className = "neutral";

  historyList.appendChild(li);
  historyList.scrollTop = historyList.scrollHeight;
}


/* ============================================================
   ANNULATION
   ============================================================ */

function undoLastMove() {
  if (validatedSegments.length === 0) return;

  const last = validatedSegments.pop();

  undoCount++;
  autoSave();
  document.getElementById("undoCount").textContent = undoCount;

  score = Math.max(0, score - 1);

  last.edges.forEach(e => usedEdges.delete(e));

  if (last.activeCount === 5) {
    jokersAvailable = Math.max(0, jokersAvailable - 1);
    jokersTotal     = Math.max(0, jokersTotal - 1);
  } 
  else if (last.activeCount === 3) {
    jokersAvailable += 1;
  } 
  else if (last.activeCount === 2) {
    jokersAvailable += 2;
  }

  last.points.forEach(key => {
    const [kx, ky] = key.split(",").map(Number);

    const stillUsed = validatedSegments.some(s =>
      s.points.some(p => {
        const [px, py] = p.split(",").map(Number);
        return px === kx && py === ky;
      })
    );

    if (!stillUsed && !permanentPoints.has(key)) {
      activePoints.delete(key);
      autoSave();
    }
  });

  const historyList = document.getElementById("historyList");
  if (historyList.lastChild) historyList.removeChild(historyList.lastChild);

  updateCounters();
  redrawEverything();
}


/* ============================================================
   FIN DE PARTIE
   ============================================================ */

function finalizeGameState() {
  gameOver = true;
  autoSave();
  stopTimer();
  localStorage.removeItem("currentGameState");

  const pauseBtn = document.getElementById("pauseBtn");
  const undoBtn  = document.getElementById("undoBtn");

  if (pauseBtn) {
    pauseBtn.disabled = true;
    pauseBtn.classList.add("disabled");
  }

  if (undoBtn) {
    undoBtn.disabled = true;
    undoBtn.classList.add("disabled");
  }
}

function showEndGamePanel() {
  const finalScoreEl = document.getElementById("finalScore");
  if (finalScoreEl) {
    finalScoreEl.textContent = "Score final : " + score;
  }

  playEndGameSound();

  gameOver = true;
  autoSave();

  const pauseBtn = document.getElementById("pauseBtn");
  const undoBtn = document.getElementById("undoBtn");

  if (pauseBtn) {
    pauseBtn.disabled = true;
    pauseBtn.classList.add("disabled");
  }

  if (undoBtn) {
    undoBtn.disabled = true;
    undoBtn.classList.add("disabled");
  }

  document.getElementById("endGameOverlay").classList.remove("hidden");
}

function isBetterThan(a, b) {
  if (!b) return true;

  if (a.score !== b.score) return a.score > b.score;
  if (a.duration !== b.duration) return a.duration < b.duration;
  if (a.returnsUsed !== b.returnsUsed) return a.returnsUsed < b.returnsUsed;

  return a.jokersUsed < b.jokersUsed;
}

async function checkGameOver() {
  const moves = getPossibleMoves();
  if (moves.length === 0) {

    gameOver = true;
    autoSave();
    stopTimer();
    localStorage.removeItem("currentGameState");

    const current = {
      score,
      returnsUsed: undoCount,
      jokersUsed: jokersTotal - jokersAvailable,
      duration: timerSeconds,
      screenshot: canvas.toDataURL("image/png"),
      date: Date.now()
    };

    const best = loadBestScore();
    const isNewRecord = isBetterThan(current, best);

    if (isNewRecord) {
      saveBestScore(current);
      updateBestScoreTop();
      playNewRecordSound();
      showBestScorePanel();
    } else {
      showEndGamePanel();
    }

    const session = supa.auth.session();
    const user = session?.user || null;

    if (user) {
      await sendScoreToSupabase(
        user.id,
        current.score,
        current.duration * 1000,
        current.returnsUsed,
        current.jokersUsed
      );
    }
  }
}


/* ============================================================
   COUPS POSSIBLES
   ============================================================ */

function getPossibleMoves() {
  const moves = [];
  const directions = [
    {dx: 1, dy: 0},
    {dx: 0, dy: 1},
    {dx: 1, dy: 1},
    {dx: 1, dy: -1}
  ];

  for (let key of activePoints) {
    const [x, y] = key.split(",").map(Number);

    for (let dir of directions) {
      const segment = [];

      for (let i = 0; i < 5; i++) {
        const px = x + i * dir.dx;
        const py = y + i * dir.dy;

        if (px < 0 || px >= size || py < 0 || py >= size) {
          segment.length = 0;
          break;
        }

        segment.push(`${px},${py}`);
      }

      if (segment.length !== 5) continue;

      const edges = edgesOfSegment(segment);
      const overlaps = edges.some(e => usedEdges.has(e));
      if (overlaps) continue;

      const activeCount = segment.filter(p => activePoints.has(p)).length;

      if (activeCount < 2) continue;
      if (activeCount === 3 && jokersAvailable < 1) continue;
      if (activeCount === 2 && jokersAvailable < 2) continue;

      moves.push(segment);
    }
  }

  return moves;
}


/* ============================================================
   PAUSE
   ============================================================ */

function pauseGame() {
  paused = true;

  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;

  document.getElementById("pauseBtn").textContent = "Reprendre";
  flash("Jeu en pause");
}

function resumeGame() {
  paused = false;
  startTimer();
  document.getElementById("pauseBtn").textContent = "Pause";
  flash("Reprise");
}

function togglePause() {
  if (paused) resumeGame();
  else pauseGame();
}


/* ============================================================
   RÉINITIALISATION DU JEU
   ============================================================ */

function startNewGame() {

  const restored = restoreGameState();

  if (restored) {
    redrawEverything();
    return;
  }

  resetGameState();
  initMaltaCross();
  redrawEverything();
  startTimer();
}

function resetGameState() {

  selectedStart = null;
  score = 0;
  paused = false;
  gameOver = false;

  activePoints = new Set();
  permanentPoints = new Set();
  usedEdges = new Set();
  validatedSegments = [];

  jokersAvailable = 0;
  jokersTotal = 0;

  undoCount = 0;
  document.getElementById("undoCount").textContent = "0";

  const stepBtn = document.getElementById("burgerStepBtn");
  stepBtn.disabled = false;
  stepBtn.classList.remove("disabled");

  resetTimer();

  const historyList = document.getElementById("historyList");
  historyList.innerHTML = "";

  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/* ============================================================
   TUTORIEL : CLIGNOTEMENT
   ============================================================ */

function blinkPoint(x, y, duration = 1200) {
  return new Promise(resolve => {
    let visible = true;

    const interval = setInterval(() => {
      redrawEverything();

      if (visible) {
        const cx = offset + x * spacing;
        const cy = offset + y * spacing;

        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 215, 0, 0.35)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#ff0000";
        ctx.fill();
      }

      visible = !visible;
    }, 250);

    setTimeout(() => {
      clearInterval(interval);
      redrawEverything();
      resolve();
    }, duration);
  });
}


/* ============================================================
   TUTORIEL : ANIMATION D’UNE LIGNE
   ============================================================ */

function animateLine(points) {
  return new Promise(resolve => {
    let i = 0;

    const interval = setInterval(() => {
      if (i >= points.length - 1) {
        clearInterval(interval);
        resolve();
        return;
      }

      const p1 = points[i].split(",").map(Number);
      const p2 = points[i + 1].split(",").map(Number);

      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(offset + p1[0] * spacing, offset + p1[1] * spacing);
      ctx.lineTo(offset + p2[0] * spacing, offset + p2[1] * spacing);
      ctx.stroke();

      i++;
    }, 200);
  });
}


/* ============================================================
   TUTORIEL : LECTURE DES ÉTAPES
   ============================================================ */

function drawSegmentProgressively(start, end, onComplete, isTutorial = false) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);

  const segment = [];

  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 0; i <= steps; i++) {
    segment.push(`${start.x + i * stepX},${start.y + i * stepY}`);
  }

  animateLine(segment).then(() => {
    segment.forEach(key => {
      const [px, py] = key.split(",").map(Number);
      drawPoint(px, py);
    });

    if (!isTutorial) {
      segment.forEach(key => activePoints.add(key));

      const edges = edgesOfSegment(segment);
      edges.forEach(e => usedEdges.add(e));

      validatedSegments.push({
        points: segment,
        edges: edges,
        activeCount: steps
      });

      score++;
      autoSave();
      updateCounters();
      appendHistoryEntry(segment, steps);
    }

    if (onComplete) onComplete();
  });
}

function playTutorialStep() {
  const step = tutorialSteps[currentTutorialStep];

  if (!step) {
    tutorialRunning = false;
    showTutorialBubble("Tutoriel terminé !");
    setTimeout(() => hideTutorialBubble(), 2000);

    setButtonsEnabled(true);

    const tutorialBtn = document.getElementById("burgerStepBtn");
    tutorialBtn.disabled = false;
    tutorialBtn.classList.remove("disabled");

    redrawEverything();
    flash("À vous de jouer", "info");
    return;
  }

  redrawEverything();

  showTutorialBubble(step.message, step.icon);
  const bubble = document.getElementById("tutorialBubble");
  bubble.className = "step" + (currentTutorialStep + 1);

  blinkPoint(step.start.x, step.start.y)
    .then(() => blinkPoint(step.end.x, step.end.y))
    .then(() => {
      drawSegmentProgressively(step.start, step.end, () => {
        setTimeout(() => {
          currentTutorialStep++;
          playTutorialStep();
        }, 600);
      }, true);
    });
}

function runTutorial() {
  if (tutorialRunning) return;

  tutorialRunning = true;
  currentTutorialStep = 0;

  setButtonsEnabled(false);

  const tutorialBtn = document.getElementById("burgerStepBtn");
  tutorialBtn.disabled = true;
  tutorialBtn.classList.add("disabled");

  playTutorialStep();
  tutorialBtn.disabled = false;
}


/* ============================================================
   FLUX INITIAL (READY / HELP / WHY SIGNUP)
   ============================================================ */

function showReadyModal() {
  document.getElementById("readyModal").classList.remove("hidden");
}

function closeReady() {
  document.getElementById("readyModal").classList.add("hidden");
}

function closeHelp() {
  const overlay = document.getElementById("helpOverlay");
  overlay.classList.add("hidden");

  if (window.helpAutoOpened) {
    localStorage.setItem("helpSeen", "true");
    document.getElementById("readyModal").classList.remove("hidden");
    startNewGame();
  }
}

function closeLogin() {
  document.getElementById("authOverlay").classList.add("hidden");
}

function closeEndGame() {
  document.getElementById("endGameOverlay").classList.add("hidden");
}

function closeBestScore() {
  document.getElementById("bestScoreOverlay").classList.add("hidden");
}

function closeWhySignup() {
  document.getElementById("whySignupModal").classList.add("hidden");
}

function enableModalBehavior(overlayId, panelSelector, closeFn) {
  const overlay = document.getElementById(overlayId);
  const panel = overlay.querySelector(panelSelector);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeFn();
  });

  panel.addEventListener("click", (e) => e.stopPropagation());
}


/* ============================================================
   DOMContentLoaded
   ============================================================ */

document.addEventListener("DOMContentLoaded", () => {

window.addEventListener("resize", () => {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  spacing = canvas.width / (size + 1);
  offset = spacing;

  redrawEverything();
});

  /* --- MODALES --- */
  enableModalBehavior("whySignupModal", ".panel", closeWhySignup);
  enableModalBehavior("authOverlay", ".panel", closeLogin);
  enableModalBehavior("helpOverlay", ".panel", closeHelp);
  enableModalBehavior("leaderboardOverlay", ".leaderboard-panel", closeLeaderboard);
  enableModalBehavior("endGameOverlay", ".panel", closeEndGame);
  enableModalBehavior("bestScoreOverlay", ".panel", closeBestScore);

  /* --- CANVAS --- */
  canvas = document.getElementById("gameCanvas");
  ctx = canvas.getContext("2d");

  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  spacing = canvas.width / (size + 1);
  offset = spacing;

  /* --- REPÈRES --- */
  const topLabels = document.querySelectorAll('#topLabels span');
  const leftLabels = document.querySelectorAll('#leftLabels span');

  topLabels.forEach(span => {
    const pos = Number(span.textContent);
    span.style.left = `${offset + (pos - 1) * spacing - 6}px`;
  });

  leftLabels.forEach(span => {
    const pos = Number(span.textContent);
    span.style.top = `${offset + (pos - 1) * spacing - 6}px`;
  });

  /* --- FIN DE PARTIE --- */
  document.getElementById("closeEndGame").addEventListener("click", () => {
    document.getElementById("endGameOverlay").classList.add("hidden");
  });

  /* --- CLIC SUR LA GRILLE --- */
  canvas.addEventListener("click", (e) => {

    if (gameOver) return;
    if (!tutorialRunning && !timerRunning) startTimer();
    if (tutorialRunning) return;
    if (paused) resumeGame();

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const nearest = getNearestPoint(mx, my);
    if (!nearest) {
      flash("Hors grille", "error");
      playErrorSound();
      selectedStart = null;
      return;
    }

    const { x, y } = nearest;

    if (!selectedStart) {
      selectedStart = { x, y };
      return;
    }

    const result = getSegmentBetween(selectedStart, { x, y });
    selectedStart = null;

    if (result) {
      playSuccessSound();
      validatedSegments.push(result);
      drawSegment(result.points);
      score++;

      const stepBtn = document.getElementById("burgerStepBtn");
      stepBtn.disabled = true;
      stepBtn.classList.add("disabled");

      updateCounters();
      appendHistoryEntry(result.points, result.activeCount);
      checkGameOver();
    }
  });

  /* --- TOP BAR --- */
  document.getElementById("undoBtn").addEventListener("click", () => {
    playClickSound();
    if (!tutorialRunning) undoLastMove();
  });

  document.getElementById("pauseBtn").addEventListener("click", () => {
    playClickSound();
    if (!tutorialRunning) togglePause();
  });

  /* --- AIDE --- */
  document.getElementById("closeHelpBtn").addEventListener("click", () => {
    playClickSound();
    closeHelp();
  });

  /* --- MENU BURGER --- */
  document.getElementById("burgerBtn").addEventListener("click", () => {
    playClickSound();
    document.getElementById("burgerOverlay").classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    const menu = document.getElementById("burgerOverlay");
    const burger = document.getElementById("burgerBtn");

    if (!menu.contains(e.target) && e.target !== burger) {
      menu.classList.remove("show");
    }
  });

  document.getElementById("burgerReplayBtn").addEventListener("click", () => {
    playClickSound();
    localStorage.removeItem("currentGameState");
    startNewGame();
    initGame();
  });

  document.getElementById("burgerStepBtn").addEventListener("click", () => {
    playClickSound();

    if (!tutorialRunning) {
      localStorage.removeItem("currentGameState");
      document.getElementById("readyModal").classList.add("hidden");
      resetGameState();
      initMaltaCross();
      redrawEverything();
      initGame();
      runTutorial();
    }
  });

  document.getElementById("burgerHelpBtn").addEventListener("click", () => {
    openHelpOverlay(false);
  });

  document.getElementById("burgerSoundBtn").addEventListener("click", () => {
    playClickSound();
    soundEnabled = !soundEnabled;
    updateSoundButton();
  });

  /* --- READY BUTTON --- */
  document.getElementById("readyBtn").addEventListener("click", () => {
    unlockAudio();
    audioUnlocked = true;

    setTimeout(() => playClickSound(), 40);

    document.getElementById("readyModal").classList.add("hidden");

    initGame();

    const board = document.getElementById("canvasContainer");
    board.classList.remove("show");
    board.classList.add("slide-in-premium");
    void board.offsetWidth;
    board.classList.add("show");

    setTimeout(() => playStartGameSound(), 1500);
  });

  /* ============================================================
     AUTHENTIFICATION (v1)
     ============================================================ */

  document.getElementById("closeAuthBtn").addEventListener("click", () => {
    playClickSound();
    closeLogin();
  });

  document.getElementById("signupBtn").addEventListener("click", () => {
    playClickSound();
    document.getElementById("signupModal").classList.remove("hidden");
  });

  document.getElementById("signupCloseBtn").addEventListener("click", () => {
    playClickSound();
    document.getElementById("signupModal").classList.add("hidden");
  });

  document.getElementById("signupConfirmBtn").addEventListener("click", async () => {
    playClickSound();

    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;
    const pseudo = document.getElementById("signupPseudoInput").value.trim();

    localStorage.setItem("lastEmail", email);

    if (!pseudo) {
      alert("Merci de choisir un pseudo.");
      return;
    }

    const { data: existing } = await supa
      .from("players")
      .select("id")
      .eq("pseudo", pseudo)
      .maybeSingle();

    if (existing) {
      alert("Ce pseudo est déjà pris.");
      return;
    }

    const { user, error } = await supa.auth.signUp({ email, password });

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }

    if (!user) {
      alert("Compte créé ! Vérifie ton email.");
      return;
    }

    await supa.from("players").insert([{
      id: user.id,
      pseudo: pseudo,
      created_at: new Date().toISOString()
    }]);

    localStorage.setItem("playerPseudo", pseudo);

    document.getElementById("signupModal").classList.add("hidden");
    document.getElementById("authOverlay").classList.add("hidden");

    updateAuthUI(user);

    alert("Compte créé ! Vérifie ton email.");
  });

  document.getElementById("loginBtn").addEventListener("click", async (e) => {
    e.preventDefault();
    playClickSound();

    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value.trim();

    if (!email || !password) {
      alert("Veuillez remplir tous les champs.");
      return;
    }

    if (!email.includes("@") || !email.includes(".")) {
      alert("Adresse email invalide.");
      return;
    }

    localStorage.setItem("lastEmail", email);

    const { user, error } = await supa.auth.signIn({ email, password });

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }

    document.getElementById("authOverlay").classList.add("hidden");

    const session = supa.auth.session();
    updateAuthUI(session?.user || null);

    if (session?.user) {
      const pseudo = await fetchPlayerPseudo(session.user.id);
      if (pseudo) localStorage.setItem("playerPseudo", pseudo);
    }
  });

  /* ============================================================
     WHY SIGNUP
     ============================================================ */

  document.getElementById("whySignupRegisterBtn").addEventListener("click", () => {
    playClickSound();
    closeWhySignup();
    document.getElementById("authOverlay").classList.remove("hidden");
  });

  document.getElementById("whySignupContinueBtn").addEventListener("click", () => {
    playClickSound();

    const dontRemind = document.getElementById("whySignupDontRemind").checked;
    if (dontRemind) localStorage.setItem("skipWhySignup", "1");

    closeWhySignup();
    document.getElementById("readyModal").classList.remove("hidden");
  });

  /* ============================================================
     FLUX INITIAL SUPABASE
     ============================================================ */

  let flowAlreadyLaunched = false;
  let initialFlowTimeout = null;

  function launchFlowOnce(userFromEvent) {
    if (flowAlreadyLaunched) return;
    flowAlreadyLaunched = true;

    handleFirstLaunchFlow(userFromEvent);
  }

  supa.auth.onAuthStateChange((event, session) => {

    if (event === "SIGNED_IN") {
      if (initialFlowTimeout) clearTimeout(initialFlowTimeout);
      launchFlowOnce(session?.user || null);
    }

    if (event === "SIGNED_OUT") {
      if (initialFlowTimeout) clearTimeout(initialFlowTimeout);
      launchFlowOnce(null);
    }
  });

  initialFlowTimeout = setTimeout(() => {
    const session = supa.auth.session();
    const user = session?.user || null;
    launchFlowOnce(user);
  }, 300);

});
