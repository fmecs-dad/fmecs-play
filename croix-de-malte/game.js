/// ===============================
//   VARIABLES GLOBALES
// ===============================

const SUPABASE_ANON_KEY = "sb_publishable_5dLGMNbcTZoT3_ixNE9XyA_Er8hV5Vb";

const supa = window.supabase.createClient(
  "https://gjzqghhqpycbcwykxvgw.supabase.co",
  SUPABASE_ANON_KEY
);

let currentLeaderboardPage = 1;
const LEADERBOARD_PAGE_SIZE = 10;

// ===============================
//   AUDIO WEB API - CONTEXTE
// ===============================
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

const audioBuffers = {};

async function loadSound(id, url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const ctx = getAudioContext();
  audioBuffers[id] = await ctx.decodeAudioData(arrayBuffer);
}

// ===============================
//   PRECHARGEMENT DES SONS
// ===============================

async function preloadAllSounds() {
  getAudioContext(); // création ici si nécessaire

  await Promise.all([
    loadSound("clickSound", "sounds/click.mp3"),
    loadSound("errorSound", "sounds/error.mp3"),
    loadSound("successSound", "sounds/success.mp3"),
    loadSound("tutorialSound", "sounds/tutorial.mp3"),
    loadSound("jokerSound", "sounds/joker.mp3"),
    loadSound("jokerLossSound", "sounds/jokerloss.mp3"),
    loadSound("endGameSound", "sounds/end.mp3"),
    loadSound("startGameSound", "sounds/start.mp3"),
    loadSound("newRecordSound", "sounds/new-record.mp3")
  ]);
}

preloadAllSounds();

// ===============================
//   DEBLOCAGE AUDIO AU 1er CLIC
// ===============================

window.addEventListener("pointerdown", () => {
  const ctx = getAudioContext(); // <-- correction ici
  if (ctx.state === "suspended") {
    ctx.resume();
  }
}, { once: true });

// ===============================
//   LECTURE D'UN SON (INSTANTANÉE)
// ===============================

function playSound(id) {
  if (!soundEnabled) return;

  const ctx = getAudioContext();
  const buffer = audioBuffers[id];
  if (!buffer) return;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
}

// ===============================
//   AUTH : UTILITAIRES
// ===============================

// ===============================
//   AUTH : UTILITAIRES
// ===============================

// Fonction pour vérifier la session au démarrage
async function checkSessionOnStartup() {
  const { data: { session }, error } = await supa.auth.getSession();

  if (error) {
    console.error("Erreur lors de la récupération de la session :", error);
    updateAuthUI(null);
    initialFlow(null); // Appeler initialFlow avec user = null
    return;
  }

  // Si une session existe, stocker le JWT et mettre à jour l'UI
  if (session) {
    localStorage.setItem('supabase.access.token', session.access_token);
    localStorage.setItem('supabase.refresh.token', session.refresh_token);
    updateAuthUI(session.user);
    initialFlow(session.user); // Appeler initialFlow avec l'utilisateur connecté
  } else {
    updateAuthUI(null);
    initialFlow(null); // Appeler initialFlow avec user = null
  }
}
// Appeler cette fonction au démarrage
checkSessionOnStartup();

// Fonction pour récupérer la session (utilise le JWT stocké)
async function getSession() {
  try {
    // 1. Vérifie d'abord si on a un token valide en localStorage
    const token = localStorage.getItem('supabase.access.token');
    if (!token) return null;

    // 2. Vérifie si le token est toujours valide
    const { data: { user }, error } = await supa.auth.getUser();

    if (error) {
      // Token invalide/expiré → on le supprime
      localStorage.removeItem('supabase.access.token');
      localStorage.removeItem('supabase.refresh.token');
      return null;
    }

    return user;
  } catch (err) {
    console.error("Erreur dans getSession:", err);
    return null;
  }
}

// Fonction pour récupérer le pseudo (version corrigée)
async function fetchPlayerPseudo(userId) {
  try {
    const token = localStorage.getItem('supabase.access.token');
    if (!token) {
      console.error("Aucun token trouvé pour fetchPlayerPseudo");
      return null;
    }

    supa.auth.setSession(token);

    const { data, error } = await supa
      .from("players")
      .select("pseudo")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Erreur lors de la récupération du pseudo:", error);
      return null;
    }

    return data?.pseudo || null;

  } catch (err) {
    console.error("Erreur inattendue dans fetchPlayerPseudo:", err);
    return null;
  }
}

// Fonction pour mettre à jour l'UI
async function updateAuthUI(user = null) {
  console.log("Updating UI with user:", user);
  const burgerAuthBtn = document.getElementById("burgerAuthBtn");
  const burgerPseudo = document.getElementById("burgerPseudo");

  if (!user) {
    if (burgerAuthBtn) burgerAuthBtn.textContent = "Se connecter";
    if (burgerPseudo) burgerPseudo.textContent = "";
    localStorage.removeItem("playerPseudo");
    localStorage.removeItem("bestScoreData");
    return;
  }

  if (burgerAuthBtn) burgerAuthBtn.textContent = "Se déconnecter";

  let fallbackPseudo = localStorage.getItem("playerPseudo") || "Joueur";
  if (burgerPseudo) burgerPseudo.textContent = fallbackPseudo;

  try {
    const pseudo = await fetchPlayerPseudo(user.id);
    if (pseudo && burgerPseudo) {
      burgerPseudo.textContent = pseudo;
      localStorage.setItem("playerPseudo", pseudo);
    }
  } catch (err) {
    console.error("Impossible de récupérer le pseudo :", err);
  }
}

// ===============================
//   PROFIL & JEU
// ===============================

function lancerJeuComplet() {
  document.getElementById("readyModal").classList.add("hidden");
  initGame();

  const board = document.getElementById("canvasContainer");
  board.classList.remove("show");
  board.classList.add("slide-in-premium");
  void board.offsetWidth;
  board.classList.add("show");
}

// Fonction pour initialiser le profil et lancer le jeu
async function initialiserProfilEtLancerJeu(session) {
  if (!session) return;

  try {
    const userId = session.user.id;
    const { data: player, error } = await supa
      .from("players")
      .select("*")
      .eq("id", userId)
      .single();

    if (error && error.code) {
      console.error("Erreur lors de la récupération du joueur :", error);
      return;
    }

    if (!player) {
      console.log("Nouveau joueur détecté, affichage de l'aide...");
      openHelpOverlay(true);
    } else {
      localStorage.setItem("playerPseudo", player.pseudo);
      console.log("Profil initialisé avec succès pour :", player.pseudo);

      // Affichage de la modale readyModal pour les utilisateurs existants
      const readyModal = document.getElementById("readyModal");
      if (readyModal) {
        readyModal.classList.remove("hidden");
      }
    }
  } catch (err) {
    console.error("Erreur inattendue dans initialiserProfilEtLancerJeu :", err);
  }
}

// ===============================
//   FONCTIONS DE PROFIL
// ===============================
async function ouvrirProfil() {
  console.log("Ouverture du profil...");

  const { data: { session }, error } = await supa.auth.getSession();
  if (error || !session) {
    console.warn("Aucun utilisateur connecté");
    return;
  }

  try {
    // Récupération des données
    const { data: player, error: playerError } = await supa
      .from("players")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (playerError) throw playerError;

    // 1. Mise à jour des éléments EXISTANTS dans votre HTML
    const emailElement = document.getElementById("profileEmail");
    const dateElement = document.getElementById("profileCreationDate");

    // 2. Application des valeurs (avec vérifications)
    if (emailElement) {
      emailElement.textContent = session.user.email || "Email non défini";
      console.log("Email défini:", session.user.email);
    } else {
      console.error("Élément profileEmail introuvable");
    }

    if (dateElement && player.created_at) {
      const date = new Date(player.created_at);
      dateElement.textContent = `Joueur depuis : ${date.toLocaleDateString()}`;
      console.log("Date définie:", date.toLocaleDateString());
    } else if (!dateElement) {
      console.error("Élément profileCreationDate introuvable");
    }

    // 3. Ouverture de la modale de modification (correction du bug)
    const modal = document.getElementById("profileModal");
    if (modal) {
      modal.classList.remove("hidden");
      console.log("Modale affichée");
    } else {
      console.error("Modale introuvable");
    }

  } catch (err) {
    console.error("Erreur:", err);
    alert("Erreur lors du chargement du profil");
  }
}
async function refreshAvatar() {
  try {
    const { data: { session }, error } = await supa.auth.getSession();
    if (error || !session) {
      console.log("Aucun utilisateur connecté");
      return;
    }

    const { data: player, error: playerError } = await supa
      .from("players")
      .select("avatar_url")
      .eq("id", session.user.id)
      .single();

    if (playerError) throw playerError;

    let avatarUrl = player.avatar_url;
    if (avatarUrl) {
      if (!avatarUrl.startsWith('http')) {
        avatarUrl = `${supa.storage.url}/object/public/avatars/${avatarUrl}`;
      }

      const profileAvatar = document.getElementById("profileAvatar");
      const avatarPreview = document.getElementById("profileAvatarPreview");

      if (profileAvatar) {
        profileAvatar.src = avatarUrl + "?t=" + Date.now(); // Ajout d'un timestamp pour forcer le rafraîchissement
        console.log("Avatar principal rafraîchi");
      }
      if (avatarPreview) {
        avatarPreview.src = avatarUrl + "?t=" + Date.now(); // Ajout d'un timestamp pour forcer le rafraîchissement
        console.log("Aperçu de l'avatar rafraîchi");
      }
    }
  } catch (err) {
    console.error("Erreur lors du rafraîchissement de l'avatar:", err);
  }
}

async function updateProfileInfo(force = false) {
  console.log("[updateProfileInfo] Début de la mise à jour du profil");

  // 1. Récupération des éléments du DOM
  const profileBtn = document.getElementById("profileBtn");
  const profileAvatar = document.getElementById("profileAvatar");
  const pseudoDisplay = document.getElementById("profilePseudoDisplay");

  // Désactive le bouton par défaut
  if (profileBtn) profileBtn.disabled = true;

  try {
    // 2. Vérification de la session
    const { data: { session }, error } = await supa.auth.getSession();
    if (error || !session) {
      console.log("[updateProfileInfo] Aucun utilisateur connecté");
      return;
    }

    // 3. Récupération des données du joueur
    const { data: player, error: playerError } = await supa
      .from("players")
      .select("pseudo, avatar_url")
      .eq("id", session.user.id)
      .single();

    if (playerError) throw playerError;

    // 4. Mise à jour du pseudo
    if (pseudoDisplay) {
      pseudoDisplay.textContent = player.pseudo || "Utilisateur";
    }

    // 5. Mise à jour de l'avatar avec URL SIGNÉE
    if (profileAvatar && player.avatar_url) {
      try {
        // Génération de l'URL signée
        const { data: signedData, error: signError } = await supa.storage
          .from('avatars')
          .createSignedUrl(player.avatar_url, 3600); // Valide 1 heure

        if (signError) throw signError;

        profileAvatar.src = signedData.signedUrl;
        console.log("[updateProfileInfo] Avatar chargé avec URL signée:", signedData.signedUrl);

        // Vérification du chargement
        const testImg = new Image();
        testImg.onload = () => console.log("[updateProfileInfo] ✅ Avatar chargé avec succès");
        testImg.onerror = () => console.error("[updateProfileInfo] ❌ Échec du chargement");
        testImg.src = signedData.signedUrl;

      } catch (err) {
        console.error("[updateProfileInfo] Erreur génération URL signée:", err);
        profileAvatar.src = "images/avatarDefault.png";
      }
    } else if (profileAvatar) {
      profileAvatar.src = "images/avatarDefault.png";
    }

    // 6. Activation du bouton profil
    if (profileBtn) {
      profileBtn.disabled = false;
      profileBtn.title = "Voir votre profil";
    }

    console.log("[updateProfileInfo] Mise à jour terminée avec succès");

  } catch (err) {
    console.error("[updateProfileInfo] Erreur:", err);
    if (profileBtn) profileBtn.disabled = true;
  }
}

// Fonction pour récupérer la session (utilise le JWT stocké)
async function getSession() {
  try {
    const token = localStorage.getItem('supabase.access.token');
    if (!token) {
      console.log("[getSession] Aucun token trouvé");
      return null;
    }

    const { data: { user }, error } = await supa.auth.getUser();
    if (error) {
      console.warn("[getSession] Token invalide:", error.message);
      localStorage.removeItem('supabase.access.token');
      localStorage.removeItem('supabase.refresh.token');
      return null;
    }

    return user;
  } catch (err) {
    console.error("[getSession] Erreur:", err);
    return null;
  }
}

function setupProfileMenu() {
  const profileBtn = document.getElementById("profileBtn");
  const profileDropdown = document.getElementById("profileDropdown");

  if (!profileBtn || !profileDropdown) {
    console.error("Menu profil: éléments manquants");
    return;
  }

  // Écouteur d'ouverture/fermeture
  profileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (profileBtn.disabled) {
      console.log("Bouton désactivé - clic ignoré");
      return;
    }

    const isShowing = profileDropdown.classList.toggle("show");

    // Logs de débogage avancés
    console.log("Dropdown togglé. Visible ?", isShowing);
    console.log("Styles après toggle:", {
      display: window.getComputedStyle(profileDropdown).display,
      visibility: window.getComputedStyle(profileDropdown).visibility,
      opacity: window.getComputedStyle(profileDropdown).opacity,
      transform: window.getComputedStyle(profileDropdown).transform
    });
  });

  // Écouteur de fermeture externe
  document.addEventListener("click", (e) => {
    if (!profileDropdown.contains(e.target) && !profileBtn.contains(e.target)) {
      profileDropdown.classList.remove("show");
      console.log("Dropdown fermé (clic externe)");
    }
  });
}

// Fonction de déconnexion
async function logout() {
  const { error } = await supa.auth.signOut();

  if (error) {
    console.error("Erreur lors de la déconnexion :", error);
  } else {
    localStorage.removeItem('sb-gjzqghhqpycbcwykxvgw-auth-token');
    localStorage.removeItem("playerPseudo");
    localStorage.removeItem("bestScoreData");
    updateAuthUI(null);
    window.location.reload(); // Optionnel : recharger la page pour réinitialiser l'état
  }
}

if (burgerAuthBtn) {
  burgerAuthBtn.addEventListener("click", async () => {
    playClickSound();

    const isConnected = burgerAuthBtn.textContent === "Se déconnecter";

    // OUVERTURE DE LA FENÊTRE DE CONNEXION
    if (!isConnected) {
      const auth = document.getElementById("authOverlay");
      auth.classList.remove("hidden");
      pauseGame();
      return;
    }

    // DÉCONNEXION
    await logout();
  });
}

// Fonction pour vérifier la session au démarrage
async function checkSessionOnStartup() {
  const { data: { session }, error } = await supa.auth.getSession();

  if (error) {
    console.error("Erreur lors de la récupération de la session :", error);
    updateAuthUI(null);
    initialFlow(null); // Appeler initialFlow avec user = null
    return;
  }

  // Si une session existe, stocker le JWT et mettre à jour l'UI
  if (session) {
    localStorage.setItem('supabase.access.token', session.access_token);
    localStorage.setItem('supabase.refresh.token', session.refresh_token);
    updateAuthUI(session.user);
    initialFlow(session.user); // Appeler initialFlow avec l'utilisateur connecté
  } else {
    updateAuthUI(null);
    initialFlow(null); // Appeler initialFlow avec user = null
  }
}

// ===============================
// FONCTIONS D'INITIALISATION DES ÉCOUTEURS
// ===============================

/**
 * Initialise tous les écouteurs pour la modale de profil
 */

async function getSignedAvatarUrl(path) {
  try {
    // On s'assure que le path est relatif (sans le préfixe public/)
    const cleanPath = path.replace(/^https:\/\/[^/]+\/storage\/v1\/object\/public\/avatars\//, '');

    const { data, error } = await supa.storage
      .from('avatars')
      .createSignedUrl(cleanPath, 3600);

    if (error) {
      console.error("Erreur lors de la génération de l'URL signée:", error);
      return null;
    }
    return data.signedUrl;
  } catch (err) {
    console.error("Erreur inattendue:", err);
    return null;
  }
}

async function uploadAvatar(file) {
  try {
    const { data: { session }, error } = await supa.auth.getSession();
    if (error || !session) throw new Error("Utilisateur non connecté");

    const filePath = `${session.user.id}/${Date.now()}.${file.type.split('/')[1]}`;

    // Upload du fichier
    const { error: uploadError } = await supa.storage
      .from('avatars')
      .upload(filePath, file, { cacheControl: '3600' });

    if (uploadError) throw uploadError;

    // On retourne juste le chemin relatif (pas l'URL complète)
    return filePath;

  } catch (err) {
    console.error("Erreur dans uploadAvatar:", err);
    throw err;
  }
}

function initProfileModalListeners() {
  // Écouteur pour le bouton "Annuler"
  const cancelBtn = document.getElementById("cancelProfileBtn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      const modal = document.getElementById("profileModal");
      if (modal) modal.classList.add("hidden");
    });
  }

  // Écouteur pour le bouton "Enregistrer"
  const saveBtn = document.getElementById("saveProfileBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      await saveProfileChanges();
    });
  }

  // Écouteur pour fermer la modale en cliquant en dehors
  const modal = document.getElementById("profileModal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) {
        e.currentTarget.classList.add("hidden");
      }
    });
  }

  // Écouteur pour le bouton "Modifier le profil" dans le dropdown
  const editProfileBtn = document.getElementById("editProfileBtn");
if (editProfileBtn) {
  editProfileBtn.addEventListener("click", async (e) => {
    e.stopPropagation(); // Empêche la propagation de l'événement
    console.log("Bouton Modifier cliqué");
    await ouvrirProfil(); // Appel de la fonction corrigée
  });
}

  // Écouteur pour le bouton "Changer l'avatar"
  const changeAvatarBtn = document.getElementById("changeAvatarBtn");
  if (changeAvatarBtn) {
    changeAvatarBtn.addEventListener("click", () => {
      const avatarUpload = document.getElementById("avatarUpload");
      if (avatarUpload) avatarUpload.click();
    });
  }

  // Gestion du fichier sélectionné pour l'avatar

  const avatarUpload = document.getElementById("avatarUpload");
if (avatarUpload) {
  avatarUpload.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Vérifications...
    const validTypes = ["image/jpeg", "image/png", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      alert("Seuls les fichiers JPEG/PNG sont acceptés");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("L'image ne doit pas dépasser 2Mo");
      return;
    }

    // Aperçu
    const preview = document.getElementById("profileAvatarPreview");
    if (preview) preview.src = URL.createObjectURL(file);

    // Upload
    try {
      const { data: { session }, error } = await supa.auth.getSession();
      if (error || !session) throw new Error("Utilisateur non connecté");

      const filePath = await uploadAvatar(file);
      const signedUrl = await getSignedAvatarUrl(filePath);

      if (!signedUrl) throw new Error("Impossible de générer l'URL signée");

      // Mise à jour dans la base de données
      const { error: dbError } = await supa
        .from("players")
        .update({ avatar_url: filePath }) // On stocke seulement le chemin relatif
        .eq("id", session.user.id);

      if (dbError) throw dbError;

      // Mise à jour de l'interface
      const profileAvatar = document.getElementById("profileAvatar");
      if (profileAvatar) profileAvatar.src = signedUrl;
      if (preview) preview.src = signedUrl;

    } catch (err) {
      console.error("Erreur:", err);
      alert("Erreur lors du changement d'avatar: " + err.message);
    }
  });
}
}

/**
 * Fonction pour sauvegarder les modifications du profil
 */
async function saveProfileChanges() {
  const pseudoInput = document.getElementById("profilePseudoInput");
  const errorMessage = document.getElementById("profileErrorMessage");

  if (!pseudoInput || !errorMessage) return;

  const newPseudo = pseudoInput.value.trim();

  if (!newPseudo) {
    errorMessage.textContent = "Le pseudo ne peut pas être vide";
    errorMessage.classList.remove("hidden");
    return;
  }

  try {
    const { data: { session }, error } = await supa.auth.getSession();
    if (error || !session) throw new Error("Utilisateur non connecté");

    // Mise à jour du pseudo dans la table players
    const { error: playerError } = await supa
      .from("players")
      .update({ pseudo: newPseudo })
      .eq("id", session.user.id);

    if (playerError) throw playerError;

    // NE PAS essayer de mettre à jour la table scores car la colonne player_name n'existe pas

    // Récupération des données mises à jour
    const { data: updatedPlayer, error: fetchError } = await supa
      .from("players")
      .select("pseudo, avatar_url")
      .eq("id", session.user.id)
      .single();

    if (fetchError) throw fetchError;

    // Mise à jour de l'interface
    const pseudoDisplay = document.getElementById("profilePseudoDisplay");
    const profileAvatar = document.getElementById("profileAvatar");
    const avatarPreview = document.getElementById("profileAvatarPreview");

    if (pseudoDisplay) pseudoDisplay.textContent = updatedPlayer.pseudo;

    // Mise à jour de l'avatar
    let avatarUrl = updatedPlayer.avatar_url;
    if (avatarUrl && !avatarUrl.startsWith('http')) {
      avatarUrl = `${supa.storage.url}/object/public/avatars/${avatarUrl}`;
    } else if (!avatarUrl) {
      avatarUrl = "images/avatarDefault.png";
    }

    if (profileAvatar) profileAvatar.src = avatarUrl;
    if (avatarPreview) avatarPreview.src = avatarUrl;

    // Fermeture de la modale
    const modal = document.getElementById("profileModal");
    if (modal) modal.classList.add("hidden");

    // Réinitialisation du message d'erreur
    errorMessage.classList.add("hidden");

  } catch (err) {
    console.error("Erreur lors de la sauvegarde du profil:", err);
    errorMessage.textContent = err.message || "Une erreur est survenue";
    errorMessage.classList.remove("hidden");
  }
}

// ===============================
//   FONCTIONS DE BASE DU JEU
// ===============================

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

  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

function restoreGameState() {

  const data = loadGameState();
  if (!data) return false;

  // Vérification stricte
  if (!Array.isArray(data.activePoints) ||
      !Array.isArray(data.permanentPoints) ||
      !Array.isArray(data.validatedSegments) ||
      data.activePoints.length === 0 ||
      data.permanentPoints.length === 0) {
    return false;
  }

  // Restaurer les Sets
  activePoints = new Set(data.activePoints);
  permanentPoints = new Set(data.permanentPoints);
  usedEdges = new Set(data.usedEdges || []);

  // Restaurer les tableaux simples
  validatedSegments = [...data.validatedSegments];

  // Restaurer les variables simples
  score = data.score ?? 0;
  jokersAvailable = data.jokersAvailable ?? 0;
  jokersTotal = data.jokersTotal ?? 0;
  undoCount = data.undoCount ?? 0;
  timerSeconds = data.timerSeconds ?? 0;

  gameOver = data.gameOver ?? false;
  paused = data.paused ?? false;

  // Restaurer l'historique interne
  historyStack = data.historyStack ? [...data.historyStack] : [];

  // Restaurer l'historique visuel
  const historyList = document.getElementById("historyList");
  historyList.innerHTML = "";
  historyStack.forEach(entry => {
    appendHistoryEntry(entry.points, entry.activeCount);
  });

  // Restaurer l'état du son
  soundEnabled = data.soundEnabled ?? true;
  updateSoundButton();

  return true;
}

// Sauvegarde automatique à chaque coup
function autoSave() {
  saveGameState();
}

// Sauvegarde à la fermeture
window.addEventListener("beforeunload", saveGameState);


// --------------------------------------------------
// AIDE
// --------------------------------------------------

function openHelpOverlay(auto = false) {

  if (!auto) playClickSound();
  const overlay = document.getElementById("helpOverlay");
  const topBar = document.getElementById("topBar");

  overlay.style.paddingTop = `${topBar.offsetHeight + 20}px`;
  overlay.classList.remove("hidden");

  // Le flash ne doit apparaître que si ce n’est PAS automatique
  //if (!auto) {
  //  flash("Jeu en pause");
  //}

  window.helpAutoOpened = auto;
}

// ===============================	
//   VARIABLES DE JEU
// ===============================

let historyStack = [];
let soundEnabled = true;
let audioUnlocked = false;

const size = 34;
let offset;
let spacing;

let selectedStart = null;
let score = 0;
let paused = false;
let gameOver = false;

let canvas = null;
let ctx = null;
let tutorialBtn = null;

let activePoints = new Set();
let permanentPoints = new Set();
let usedEdges = new Set();
let validatedSegments = [];

let jokersAvailable = 0;
let jokersTotal = 0;

let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;

let undoCount = 0;

let currentTutorialStep = 0;
let tutorialRunning = false;

let readyModalAlreadyShown = false;

let currentPage = 1;
const limit = 20;
let isLoading = false;
let allScoresLoaded = false;
let loadedScores = [];

const HELP_SEEN_KEY = "helpSeen";

async function sendScoreToSupabase(userId, score, durationMs, undoCount, jokersUsed) {
  const token = localStorage.getItem('supabase.access.token');
  if (!token) {
    console.error("Aucun JWT trouvé. L'utilisateur n'est pas connecté.");
    return;
  }

  supa.auth.setSession(token);

  try {
    // Vérifiez que l'utilisateur est bien celui attendu
    const { data: { user }, error } = await supa.auth.getUser(token);
    if (error || !user || user.id !== userId) {
      console.error("Session invalide ou utilisateur non autorisé.");
      return;
    }

    // Logique pour enregistrer le score
    const { data: existingScores, error: fetchError } = await supa
      .from("scores")
      .select("id, score")
      .eq("player_id", userId)
      .order("score", { ascending: false })
      .limit(10);

    if (fetchError) {
      console.error("Erreur lors de la récupération des scores du joueur :", fetchError);
      return;
    }

    if (existingScores.length >= 10) {
      const worstScore = existingScores[existingScores.length - 1];
      const { error: deleteError } = await supa
        .from("scores")
        .delete()
        .eq("id", worstScore.id);

      if (deleteError) {
        console.error("Erreur lors de la suppression du pire score :", deleteError);
        return;
      }
    }

    const message = `${userId}-${score}-${durationMs}-${undoCount}-${jokersUsed}-${Date.now()}`;
    const hash = await sha256(message);

    const { error: insertError } = await supa
      .from("scores")
      .insert({
        player_id: userId,
        pseudo: await fetchPlayerPseudo(userId),
        score: score,
        duration_ms: durationMs,
        undo_count: undoCount,
        jokers_used: jokersUsed,
        hash: hash,
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error("Erreur lors de l'insertion du score :", insertError);
    } else {
      console.log("Score enregistré avec succès !");
    }
  } catch (err) {
    console.error("Erreur inattendue lors de l'enregistrement du score :", err);
  }
}

const tutorialSteps = [
  { message: "Exemple 1 : une ligne horizontale.", start: { x: 15, y: 12 }, end: { x: 19, y: 12 } },
  { message: "Exemple 2 : une ligne verticale.",   start: { x: 15, y: 12 }, end: { x: 15, y: 16 } },
  { message: "Exemple 3 : une ligne diagonale.",   start: { x: 12, y: 16 }, end: { x: 16, y: 12 } }
];

// ===============================
//   MEILLEUR SCORE
// ===============================

async function loadMoreScores() {
  if (isLoading || allScoresLoaded) return;

  isLoading = true;
  const container = document.getElementById("leaderboardContainer");
  const { data: { session }, error } = await supa.auth.getSession();
  const user = session?.user || null;
  const isLoggedIn = !!user;

  const list = await fetchLeaderboard(currentPage, limit);
  console.log("Liste des scores récupérés :", list); // Log pour vérifier les scores récupérés

  if (list.length === 0) {
    allScoresLoaded = true;
    isLoading = false;
    return;
  }

  const newScores = list.filter(score => !loadedScores.some(loadedScore => loadedScore.created_at === score.created_at && loadedScore.score === score.score));
  loadedScores = [...loadedScores, ...newScores];

  if (newScores.length > 0) {
    renderLeaderboard(newScores, isLoggedIn, user?.id || null, true);
    currentPage++;
  }

  isLoading = false;
}

document.getElementById("leaderboardContainer").addEventListener("scroll", async () => {
  const container = document.getElementById("leaderboardContainer");
  if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
    await loadMoreScores();
  }
});

async function fetchLeaderboard(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const response = await fetch(
    `https://gjzqghhqpycbcwykxvgw.supabase.co/rest/v1/scores?select=score,duration_ms,undo_count,jokers_used,created_at,players(id,pseudo)&order=score.desc,duration_ms.asc,undo_count.asc,jokers_used.asc&limit=${limit}&offset=${offset}`,
    {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );
  const data = await response.json();
  console.log("Scores récupérés depuis Supabase :", data); // Log pour vérifier les données retournées
  return data;
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

  const data = await response.json();
  console.log("Scores de l'utilisateur connecté :", data); // Log pour vérifier les scores de l'utilisateur
  return data;
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec.toString().padStart(2, "0")}s`;
}

function formatDate(value) {
  if (!value) return "";

  const normalized = value.replace(" ", "T");
  const d = new Date(normalized);

  if (isNaN(d.getTime())) return "";

  return d.toLocaleDateString("fr-FR", {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });
}

/* ============================================================
   TITRE DU LEADERBOARD
   ============================================================ */

function renderLeaderboardHeader(isLoggedIn) {
  const title = document.getElementById("leaderboardTitle");
  const hintContainer = document.querySelector(".leaderboard-hint");

  if (!title || !hintContainer) return;

  // Titre toujours simple
  title.textContent = "Leaderboard";

  // Si non connecté → afficher le message
  if (!isLoggedIn) {
    hintContainer.textContent = "Si tu veux voir tes scores, inscris‑toi 🙂";
    hintContainer.style.display = "block";
  } else {
    // Si connecté → cacher le message
    hintContainer.style.display = "none";
  }
}



/* ============================================================
   AFFICHAGE DU LEADERBOARD (scroll + snapping)
   ============================================================ */

function truncatePseudo(pseudo) {
  return pseudo.length > 12 ? pseudo.slice(0, 12) + "…" : pseudo;
}

function renderLeaderboard(list, isLoggedIn, userId = null, append = false) {
  renderLeaderboardHeader(isLoggedIn);

  const container = document.getElementById("leaderboardContainer");
  if (!container) return;

  console.log("Liste des scores à afficher :", list); // Log pour vérifier les scores à afficher

  if (!append) {
    container.innerHTML = "";
  }

  let filteredList = [...list];

  let bestScore = null;
  if (userId) {
    const userScores = list.filter(entry => entry.players?.id === userId);
    if (userScores.length > 0) {
      bestScore = Math.max(...userScores.map(score => score.score));
    }
  }

  if (!append) {
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
  }

  filteredList.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "leaderboard-row";

    const pseudo = truncatePseudo(entry.players?.pseudo ?? "???");
    const date = formatDate(entry.created_at);

    const rank = append ? (currentPage - 1) * limit + index + 1 : index + 1;

    row.innerHTML = `
      <span class="rank">${rank}</span>
      <span class="pseudo">${pseudo}</span>
      <span class="score">${entry.score}</span>
      <span class="duration">${formatDuration(entry.duration_ms)}</span>
      <span class="undo">${entry.undo_count}</span>
      <span class="jokers">${entry.jokers_used}</span>
      <span class="date">${date}</span>
    `;

    if (userId && entry.players?.id === userId && entry.score === bestScore) {
      row.classList.add("my-best-score");
      console.log("Meilleur score de l'utilisateur mis en évidence :", entry.score);
    }

    container.appendChild(row);
  });

  if (!append) {
    container.scrollTop = 0;
  }
}

/* ============================================================
   OUVERTURE / FERMETURE DU LEADERBOARD
   ============================================================ */

// --- OUVERTURE LEADERBOARD ---

document.getElementById("burgerLeaderboardBtn").addEventListener("click", async () => {
  playClickSound();
  pauseGame();

  const overlay = document.getElementById("leaderboardOverlay");
  overlay.classList.remove("hidden");

  const { data: { session }, error } = await supa.auth.getSession();
  const user = session?.user || null;
  const isLoggedIn = !!user;

  // Réinitialiser les variables de chargement
  currentPage = 1;
  isLoading = false;
  allScoresLoaded = false;
  loadedScores = [];

  const list = await fetchLeaderboard(currentPage, limit);
  loadedScores = [...list];
  renderLeaderboard(list, isLoggedIn, user?.id || null);
});

// Ajout du scroll event pour le chargement par lots
document.getElementById("leaderboardContainer").addEventListener("scroll", async () => {
  const container = document.getElementById("leaderboardContainer");
  if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) {
    await loadMoreScores();
  }
});

// --- FERMETURE LEADERBOARD (fonction centralisée) ---
function closeLeaderboard() {
  const overlay = document.getElementById("leaderboardOverlay");
  overlay.classList.add("hidden");

}

// --- Bouton de fermeture ---
document.getElementById("closeLeaderboardBtn").addEventListener("click", () => {
  playClickSound();
  closeLeaderboard();
});


/* ============================================================
   COMPORTEMENT MODAL DU LEADERBOARD
   ============================================================ */

const leaderboardOverlay = document.getElementById("leaderboardOverlay");
const leaderboardPanel = leaderboardOverlay.querySelector(".leaderboard-panel");

// Clic sur le fond sombre → fermer
leaderboardOverlay.addEventListener("click", (e) => {
  if (e.target === leaderboardOverlay) {
    playClickSound();
    closeLeaderboard();
  }
});

// Clic dans la fenêtre → ne pas fermer
leaderboardPanel.addEventListener("click", (e) => e.stopPropagation());


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

function showBestScorePanel() {
  const panel = document.getElementById("bestScoreContent");
  if (!panel) return;

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

function updateSoundButton() {
  const btn = document.getElementById("burgerSoundBtn");
  btn.textContent = soundEnabled ? "Son : on" : "Son : off";
}

// ===============================
//   SAUVEGARDE PARTIE EN COURS
// ===============================

function saveGameState() {
  if (tutorialRunning) return; // jamais pendant le tutoriel

  const data = {
    activePoints: Array.from(activePoints),
    permanentPoints: Array.from(permanentPoints),
    usedEdges: Array.from(usedEdges),
    validatedSegments, // tableau simple → OK
    historyStack: JSON.parse(JSON.stringify(validatedSegments)),
    //historyStack: JSON.parse(JSON.stringify(historyStack)),
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



// ===============================
//   FONCTIONS AUDIO
// ===============================

function playClickSound()      { playSound("clickSound"); }
function playErrorSound()      { playSound("errorSound"); }
function playSuccessSound()    { playSound("successSound"); }
function playTutorialSound()   { playSound("tutorialSound"); }
function playJokerGainSound()  { playSound("jokerSound"); }
function playJokerLossSound()  { playSound("jokerLossSound"); }
function playEndGameSound()    { playSound("endGameSound"); }
function playStartGameSound()  { playSound("startGameSound"); }
function playNewRecordSound()  { playSound("newRecordSound"); }


// ===============================
//   UTILITAIRES UI
// ===============================


async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

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

function setButtonsEnabled(enabled) {
  document.querySelectorAll("#buttonsArea button").forEach(btn => {
    btn.disabled = !enabled;
    btn.classList.toggle("disabled", !enabled);
  });
}

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function startTimer() {
  if (timerInterval) return; // empêche tout double interval
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

function pauseGame() {
  if (gameTimer) clearInterval(gameTimer);
}

function resumeGame() {
  startGameTimer(); // ta fonction existante
}

function enableModalBehavior(overlayId, panelSelector, closeFn) {
  const overlay = document.getElementById(overlayId);
  const panel = overlay.querySelector(panelSelector);

  // Clic sur le fond sombre → fermer
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeFn();
  });

  // Clic dans la fenêtre → ne pas fermer
  panel.addEventListener("click", (e) => e.stopPropagation());
}


// ===============================
//   DESSIN DE LA GRILLE
// ===============================

const visualOrigin = offset - spacing;

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

// ===============================
//   TROUVER LE POINT LE PLUS PROCHE
// ===============================

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

  if (bestDist <= 15) return best;

  return null;
}

function snapToAlignedPoint(first, clicked, mx, my) {
  const { x: x1, y: y1 } = first;
  const { x: x2, y: y2 } = clicked;

  // 1. Déjà aligné ?
  if (x1 === x2 || y1 === y2 || Math.abs(x1 - x2) === Math.abs(y1 - y2)) {
    return clicked;
  }

  // 2. Chercher le point aligné le plus proche
  const candidates = [];

  // même colonne
  candidates.push({ x: x1, y: y2 });

  // même ligne
  candidates.push({ x: x2, y: y1 });

  // diagonales
  const dx = x2 - x1;
  const dy = y2 - y1;
  const signX = dx > 0 ? 1 : -1;
  const signY = dy > 0 ? 1 : -1;
  candidates.push({ x: x1 + Math.abs(dy) * signX, y: y1 + Math.abs(dy) * signY });
  candidates.push({ x: x1 + Math.abs(dx) * signY, y: y1 + Math.abs(dx) * signX });

  // 3. Choisir le plus proche
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

  // 4. Tolérance
  if (bestDist <= 15) return best;

  return clicked; // pas de snap possible
}


// ===============================
//   CROIX DE MALTE
// ===============================

function drawMaltaCross() {
  permanentPoints.forEach(key => {
    const [x, y] = key.split(",").map(Number);
    drawPoint(x, y);
  });
}

function initMaltaCross() {

  permanentPoints.clear();
  activePoints.clear();

  // Construction brute de la croix
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

  // Point de référence dans la croix brute
  const refX = -3;
  const refY = 3;

  // Point logique où placer ce point
  const targetLeftX = 12;
  const targetLeftY = 15;

  const offsetX = targetLeftX - refX; // 15
  const offsetY = targetLeftY - refY; // 12

  // Application de l’offset
  pts.forEach(p => {
    const key = `${p.x + offsetX},${p.y + offsetY}`;
    permanentPoints.add(key);
    activePoints.add(key);
  });
}

function redrawEverything() {

  // Le canvas s’adapte visuellement
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


// ===============================
//   ARÊTES
// ===============================

function edgeKey(a, b) {
  return (a < b) ? `${a}|${b}` : `${b}|${a}`;
}

function edgesOfSegment(segmentKeys) {
  const edges = [];
  for (let i = 0; i < 4; i++) edges.push(edgeKey(segmentKeys[i], segmentKeys[i+1]));
  return edges;
}


// ===============================
//   JOKERS
// ===============================

function gainJoker() {
  jokersAvailable++;
  autoSave();
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

// ===============================
//   VALIDATION D’UN SEGMENT
// ===============================

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


// ===============================
//   HISTORIQUE
// ===============================

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


// ===============================
//   ANNULATION
// ===============================

function undoLastMove() {
  if (validatedSegments.length === 0) return;

  const last = validatedSegments.pop();

  resumeGame();
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


// ===============================
//   FIN DE PARTIE
// ===============================

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

  const overlay = document.getElementById("endGameOverlay");
  if (overlay) overlay.classList.remove("hidden");
}

function isBetterThan(a, b) {
    if (!b) return true; // Aucun record existant

    // 1. Score le plus élevé
    if (a.score !== b.score)
        return a.score > b.score;

    // 2. À score égal → durée la plus courte
    if (a.duration !== b.duration)
        return a.duration < b.duration;

    // 3. À durée égale → moins de retours
    if (a.returnsUsed !== b.returnsUsed)
        return a.returnsUsed < b.returnsUsed;

    // 4. À retours égal → moins de jokers
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

    // Récupère la session de manière asynchrone
    const { data: { session }, error } = await supa.auth.getSession();
    const user = session?.user;

    if (user) {
      console.log("User ID:", user.id); // Vérifie que l'ID est correct
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

// ===============================
//   PAUSE
// ===============================

function pauseGame() {
  if (gameOver) return; // Empêche la pause après la fin de partie

  paused = true;

  clearInterval(timerInterval);
  timerInterval = null;
  timerRunning = false;

  document.getElementById("pauseBtn").textContent = "Reprendre";
  flash("Jeu en pause");
}

function resumeGame() {
  if (gameOver) return; // Empêche la reprise après la fin de partie

  paused = false;

  startTimer();

  document.getElementById("pauseBtn").textContent = "Pause";
  flash("Reprise");
}

function togglePause() {
  if (paused) resumeGame();
  else pauseGame();
}

// ===============================
//   RÉINITIALISATION DU JEU
// ===============================

function startNewGame() {

  // Tentative de restauration
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

// ===============================
//   TUTORIEL : CLIGNOTEMENT
// ===============================

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


// ===============================
//   TUTORIEL : ANIMATION D’UNE LIGNE
// ===============================

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


// ===============================
//   TUTORIEL AUTOMATIQUE
// ===============================

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

// --------------------------------------
// Fonction indépendante
// --------------------------------------
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

  // 1) Récupération de l’étape
  const step = tutorialSteps[currentTutorialStep];

  // 2) Fin du tutoriel
  if (!step) {
  tutorialRunning = false;
  showTutorialBubble("Tutoriel terminé !");
  setTimeout(() => hideTutorialBubble(), 2000);

  setButtonsEnabled(true);

  const tutorialBtn = document.getElementById("burgerStepBtn");
  tutorialBtn.disabled = false;
  tutorialBtn.classList.remove("disabled");

  redrawEverything();
  flash("A vous de jouer", "info");
  return;
}


  // 3) Mise à jour visuelle
  if (typeof positionLabels === "function") {
    positionLabels();
  }

  redrawEverything();

  // 4) Affichage du message
  showTutorialBubble(step.message, step.icon);
  const bubble = document.getElementById("tutorialBubble");
  bubble.className = "step" + (currentTutorialStep + 1);

  // 5) Animation : start → end → segment
  blinkPoint(step.start.x, step.start.y)
    .then(() => blinkPoint(step.end.x, step.end.y))
    .then(() => {
      drawSegmentProgressively(step.start, step.end, () => {

        // 6) Passage à l’étape suivante
        setTimeout(() => {
          currentTutorialStep++;
          playTutorialStep();
        }, 600);

      }, true);
    });
}

// ===============================
//   INITIALISATION DU JEU (GLOBAL !)
// ===============================

function initGame() {

  const undoBtn = document.getElementById("undoBtn");
  if (undoBtn) {
    undoBtn.disabled = false;
    undoBtn.classList.remove("disabled");
  }

  //const restored = false;
  const restored = restoreGameState();

  if (!restored || gameOver) {
    resetGameState();
    initMaltaCross();
  }

  redrawEverything();

  updateCounters();
  document.getElementById("undoCount").textContent = undoCount;
  updateSoundButton();
  document.getElementById("timerValue").textContent = formatTime(timerSeconds);

  gameOver = false;
  paused = false;

  updateBestScoreTop();

}

// ===============================
//   FIRST LAUNCH FLOW
// ===============================

function handleFirstLaunchFlow(userFromEvent) {

  const helpAlreadySeen = localStorage.getItem(HELP_SEEN_KEY) === "true";

  if (!helpAlreadySeen) {
    openHelpOverlay(true);
    return;
  }

  initialFlow(userFromEvent);
}

// ===============================
//   INITIAL FLOW (VERSION FINALE)
// ===============================

//let gameStarted = false; // global

function initialFlow(user) {
  console.log("initialFlow appelé avec user :", user);

  let lastEmail;
  let skip;

  try {
    lastEmail = localStorage.getItem("lastEmail");
    skip = localStorage.getItem("skipWhySignup") === "1";
  } catch (err) {
    console.error("Erreur d'accès à localStorage :", err);
    lastEmail = null;
    skip = false;
  }

  console.log("lastEmail :", lastEmail);
  console.log("skip :", skip);

  // 1. Utilisateur connecté → readyModal
  if (user) {
    console.log("Utilisateur connecté, affichage de readyModal...");
    showReadyModal("connected");
    return;
  }

  // 2. Joueur déconnecté mais a choisi "Ne plus me rappeler" → readyModal
  if (skip) {
    console.log("Joueur déconnecté mais a choisi 'Ne plus me rappeler', affichage de readyModal...");
    showReadyModal("skipWhySignup");
    return;
  }

  // 3. Joueur déconnecté + a déjà saisi un email → whySignupModal
  if (lastEmail) {
    console.log("Joueur déconnecté et a déjà saisi un email, affichage de whySignupModal...");
    document.getElementById("whySignupModal").classList.remove("hidden");
    return;
  }

  // 4. Nouveau joueur → whySignupModal
  if (!lastEmail) {
    console.log("Nouveau joueur, affichage de whySignupModal...");
    document.getElementById("whySignupModal").classList.remove("hidden");
    return;
  }

  // 5. Fallback (ne devrait jamais arriver)
  console.log("Fallback, affichage de authOverlay...");
  const auth = document.getElementById("authOverlay");
  auth.classList.remove("hidden");
}

function showReadyModal(reason) {
  console.log(`Affichage de readyModal pour la raison : ${reason}`);
  const modal = document.getElementById("readyModal");
  if (modal) {
    console.log("[showReadyModal] Modale trouvée. Classes avant:");
    modal.classList.remove("hidden");
    console.log("[showReadyModal] Classes après:", modal.className);
  } else {
    console.error("Élément readyModal non trouvé dans le DOM.");
  }
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
  const auth = document.getElementById("authOverlay");
  auth.classList.add("hidden");
}

function closeEndGame() {
  const overlay = document.getElementById("endGameOverlay");
  overlay.classList.add("hidden");
}

function closeBestScore() {
  const overlay = document.getElementById("bestScoreOverlay");
  overlay.classList.add("hidden");
}

function closeProfile() {
  document.getElementById("profileModal").classList.add("hidden");
}

function closeWhySignup() {
  document.getElementById("whySignupModal").classList.add("hidden");
}

// ===============================
//   DOMContentLoaded (correction ciblée pour le menu profil)
// ===============================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("=== Initialisation DOM ===");
  console.log("=== Vérification éléments profil ===");
  console.log({
    profileBtn: !!document.getElementById("profileBtn"),
    profileDropdown: !!document.getElementById("profileDropdown"),
    profileAvatar: !!document.getElementById("profileAvatar"),
    profilePseudoDisplay: !!document.getElementById("profilePseudoDisplay")
  });

  try {
    // 1. Initialisation de base (votre code existant)
    const { data: { session }, error } = await supa.auth.getSession();

    if (session) {
      console.log("Utilisateur connecté détecté au démarrage");
      localStorage.setItem('supabase.access.token', session.access_token);
      localStorage.setItem('supabase.refresh.token', session.refresh_token);
      await initialiserProfilEtLancerJeu(session);
      updateAuthUI(session.user);
      updateProfileInfo(); // Mise à jour du profil pour les utilisateurs déjà connectés
    } else {
      console.log("Aucun utilisateur connecté au démarrage");
      updateAuthUI(null);
    }

    // 2. Initialisation du menu profil (version corrigée)
    const setupProfileMenu = () => {
      const profileBtn = document.getElementById("profileBtn");
      const profileDropdown = document.getElementById("profileDropdown");

      if (!profileBtn || !profileDropdown) {
        console.error("Menu profil : éléments manquants");
        return;
      }

      // Écouteur pour ouvrir/fermer le dropdown
      profileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (profileBtn.disabled) {
          console.log("Bouton profil désactivé - clic ignoré");
          return;
        }
        console.log("Toggle menu profil");
        profileDropdown.classList.toggle("show");
      });

      // Écouteur pour fermer le dropdown quand on clique ailleurs
      document.addEventListener("click", (e) => {
        if (!profileDropdown.contains(e.target) && !profileBtn.contains(e.target)) {
          profileDropdown.classList.remove("show");
          console.log("Fermeture menu profil (clic externe)");
        }
      });
    };

    // Appel de l'initialisation du menu profil
    setupProfileMenu();
    initProfileModalListeners(); // Écouteurs de la modale (inclut maintenant l'avatar)

    // 3. Appel à initialFlow (votre code existant)
    const user = session ? session.user : null;
    initialFlow(user);

    // 4. Activation des comportements des modales (votre code existant)
    if (typeof enableModalBehavior === 'function') {
      enableModalBehavior("whySignupModal", ".panel", closeWhySignup);
      enableModalBehavior("authOverlay", ".panel", closeLogin);
      enableModalBehavior("profileModal", ".panel", closeProfile);
      enableModalBehavior("helpOverlay", ".panel", closeHelp);
      enableModalBehavior("leaderboardOverlay", ".leaderboard-panel", closeLeaderboard);
      enableModalBehavior("endGameOverlay", ".panel", closeEndGame);
      enableModalBehavior("bestScoreOverlay", ".panel", closeBestScore);
    }

    // 5. Initialisation du canvas (votre code existant)
    canvas = document.getElementById("gameCanvas");
    if (canvas) {
      ctx = canvas.getContext("2d");

      // Calcul du canvas et de la grille
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      spacing = canvas.width / (size + 1);
      offset = spacing;

      // Positionnement des repères
      const topLabels = document.querySelectorAll('#topLabels span');
      const leftLabels = document.querySelectorAll('#leftLabels span');

      if (topLabels.length && leftLabels.length) {
        topLabels.forEach(span => {
          const pos = Number(span.textContent);
          if (!Number.isFinite(pos)) return;
          span.style.left = `${offset + (pos - 1) * spacing - 6}px`;
        });

        leftLabels.forEach(span => {
          const pos = Number(span.textContent);
          if (!Number.isFinite(pos)) return;
          span.style.top = `${offset + (pos - 1) * spacing - 6}px`;
        });
      }
    } else {
      console.error("Canvas non trouvé");
    }

  } catch (err) {
    console.error("Erreur DOMContentLoaded:", err);
    updateAuthUI(null);
    initialFlow(null);
  }

// ===============================
//   GESTION DU MENU PROFIL (version finale corrigée)
// ===============================

const initProfileMenu = () => {
  const profileBtn = document.getElementById("profileBtn");
  const profileDropdown = document.getElementById("profileDropdown");

  if (!profileBtn || !profileDropdown) {
    console.error("Menu profil: éléments manquants");
    return;
  }

  // Écouteur pour ouvrir/fermer le dropdown
  profileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (profileBtn.disabled) {
      console.log("Bouton désactivé - clic ignoré");
      return;
    }
    console.log("Toggle menu profil");
    profileDropdown.classList.toggle("show");
  });

  // Écouteur pour fermer quand on clique ailleurs
  document.addEventListener("click", (e) => {
    if (!profileDropdown.contains(e.target) && !profileBtn.contains(e.target)) {
      profileDropdown.classList.remove("show");
      console.log("Menu profil fermé (clic externe)");
    }
  });
};

  // Écouteur pour afficher/masquer le mot de passe (votre code existant)
  const togglePasswordBtn = document.getElementById("togglePasswordVisibility");
if (togglePasswordBtn) {
  togglePasswordBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const passwordSpan = document.getElementById("profilePassword");
    if (passwordSpan) {
      const currentText = passwordSpan.textContent;
      passwordSpan.textContent = currentText === "••••••••" ? "motdepasse" : "••••••••";
      togglePasswordBtn.textContent = currentText === "••••••••" ? "👁️‍🗨️" : "👁️";
    }
  });
}

  // Fermeture du menu avec la touche Echap
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const dropdown = document.getElementById("profileDropdown");
    if (dropdown && dropdown.classList.contains("show")) {
      dropdown.classList.remove("show");
    }
  }
})

  // Écouteur pour la déconnexion (votre code existant)
  const logoutProfileBtn = document.getElementById("logoutProfileBtn");
  if (logoutProfileBtn) {
    logoutProfileBtn.addEventListener("click", async () => {
      if (typeof logout === 'function') await logout();
      const dropdown = document.getElementById("profileDropdown");
      if (dropdown) dropdown.classList.remove("show");
    });
  }

  // Écouteur pour ouvrir la modale de modification du profil (votre code existant)
  const editProfileBtn = document.getElementById("editProfileBtn");
  if (editProfileBtn) {
    editProfileBtn.addEventListener("click", async () => {
      if (typeof ouvrirProfil === 'function') await ouvrirProfil();
    });
  }

  // Mise à jour des informations du profil (votre code existant)
  if (typeof updateProfileInfo === 'function') updateProfileInfo();

  // Écouteurs pour les boutons de la modale
document.getElementById("cancelProfileBtn")?.addEventListener("click", () => {
  const modal = document.getElementById("profileModal");
  if (modal) modal.classList.add("hidden");
});

document.getElementById("saveProfileBtn")?.addEventListener("click", async () => {
  const pseudoInput = document.getElementById("profilePseudoInput");
  const errorMessage = document.getElementById("profileErrorMessage");

  if (!pseudoInput || !errorMessage) return;

  const newPseudo = pseudoInput.value.trim();

  if (!newPseudo) {
    errorMessage.textContent = "Le pseudo ne peut pas être vide";
    errorMessage.classList.remove("hidden");
    return;
  }

  try {
    const user = await getSession();
    if (!user) throw new Error("Utilisateur non connecté");

    // Mise à jour du pseudo dans la base de données
    const { error } = await supa
      .from("players")
      .update({ pseudo: newPseudo })
      .eq("id", user.id);

    if (error) throw error;

    // Mise à jour de l'interface
    const pseudoDisplay = document.getElementById("profilePseudoDisplay");
    if (pseudoDisplay) pseudoDisplay.textContent = newPseudo;

    // Fermeture de la modale
    const modal = document.getElementById("profileModal");
    if (modal) modal.classList.add("hidden");

    // Réinitialisation du message d'erreur
    errorMessage.classList.add("hidden");

  } catch (err) {
    console.error("Erreur lors de la sauvegarde du profil:", err);
    errorMessage.textContent = err.message || "Une erreur est survenue";
    errorMessage.classList.remove("hidden");
  }
});

// Écouteur pour fermer la modale en cliquant en dehors
document.getElementById("profileModal")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.add("hidden");
  }
});

  // ===============================
  //   FIN DE PARTIE
  // ===============================
  const closeEndGameBtn = document.getElementById("closeEndGame");
  if (closeEndGameBtn) {
    closeEndGameBtn.addEventListener("click", closeEndGame);
  }

  // ===============================
  //   CLIC SUR LA GRILLE
  // ===============================
  if (canvas) {
    canvas.addEventListener("click", (e) => {
      if (gameOver) return;
      if (!tutorialRunning && !timerRunning && typeof startTimer === 'function') startTimer();
      if (tutorialRunning) return;
      if (paused && typeof resumeGame === 'function') resumeGame();

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const nearest = getNearestPoint(mx, my);
      if (!nearest) {
        if (typeof flash === 'function') flash("Hors grille", "error");
        if (typeof playErrorSound === 'function') playErrorSound();
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
        if (typeof playSuccessSound === 'function') playSuccessSound();
        validatedSegments.push(result);
        if (typeof drawSegment === 'function') drawSegment(result.points);
        score++;

        const stepBtn = document.getElementById("burgerStepBtn");
        if (stepBtn) {
          stepBtn.disabled = true;
          stepBtn.classList.add("disabled");
        }

        if (typeof updateCounters === 'function') updateCounters();
        if (typeof appendHistoryEntry === 'function') appendHistoryEntry(result.points, result.activeCount);
        if (typeof checkGameOver === 'function') checkGameOver();
      }
    });
  }

  // ===============================
  //   BOUTONS TOP BAR
  // ===============================
  const undoBtn = document.getElementById("undoBtn");
  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      if (typeof playClickSound === 'function') playClickSound();
      if (!tutorialRunning && typeof undoLastMove === 'function') undoLastMove();
    });
  }

  const pauseBtn = document.getElementById("pauseBtn");
  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      if (typeof playClickSound === 'function') playClickSound();
      if (!tutorialRunning && typeof togglePause === 'function') togglePause();
    });
  }

  // ===============================
  //   MENU BURGER
  // ===============================
  const burgerBtn = document.getElementById("burgerBtn");
  if (burgerBtn) {
    burgerBtn.addEventListener("click", () => {
      if (typeof playClickSound === 'function') playClickSound();
      const ov = document.getElementById("burgerOverlay");
      if (ov) ov.classList.toggle("show");
    });
  }

  document.addEventListener("click", (e) => {
    const menu = document.getElementById("burgerOverlay");
    const burger = document.getElementById("burgerBtn");
    if (menu && burger && !menu.contains(e.target) && e.target !== burger) {
      menu.classList.remove("show");
    }
  });

  // ===============================
  //   AUTH BURGER (v1)
  // ===============================
  const burgerAuthBtn = document.getElementById("burgerAuthBtn");
  if (burgerAuthBtn) {
    burgerAuthBtn.addEventListener("click", async () => {
      if (typeof playClickSound === 'function') playClickSound();
      const user = await getSession();
      if (!user) {
        const authOverlay = document.getElementById("authOverlay");
        if (authOverlay) authOverlay.classList.remove("hidden");
        if (typeof pauseGame === 'function') pauseGame();
        return;
      }
      if (typeof logout === 'function') await logout();
    });
  }

  // ===============================
  //   AUTRES ÉCOUTEURS DE BOUTONS
  // ===============================

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

  // Écouteur pour le bouton de fermeture de l'aide
const closeHelpBtn = document.getElementById("closeHelpBtn");
if (closeHelpBtn) {
  closeHelpBtn.addEventListener("click", () => {
    if (typeof playClickSound === 'function') playClickSound();
    closeHelp();  // Utilisation de la fonction de fermeture
  });
}

// Écouteur pour le bouton d'aide dans le menu burger
const burgerHelpBtn = document.getElementById("burgerHelpBtn");
if (burgerHelpBtn) {
  burgerHelpBtn.addEventListener("click", () => {
    if (typeof playClickSound === 'function') playClickSound();
    if (typeof openHelpOverlay === 'function') openHelpOverlay(false);
    if (typeof pauseGame === 'function') pauseGame();
  });
}

  const burgerSoundBtn = document.getElementById("burgerSoundBtn");
  if (burgerSoundBtn) {
    burgerSoundBtn.addEventListener("click", () => {
      if (typeof playClickSound === 'function') playClickSound();
      soundEnabled = !soundEnabled;
      if (typeof updateSoundButton === 'function') updateSoundButton();
    });
  }

  // ===============================
  //   READY BUTTON (version originale préservée exactement)
  // ===============================
  const readyBtn = document.getElementById("readyBtn");
  if (readyBtn) {
    readyBtn.addEventListener("click", () => {
      if (typeof playClickSound === 'function') playClickSound();

      const readyModal = document.getElementById("readyModal");
      if (readyModal) readyModal.classList.add("hidden");

      if (typeof initGame === 'function') initGame();

      const board = document.getElementById("canvasContainer");
      if (board) {
        board.classList.remove("show");
        board.classList.add("slide-in-premium");
        void board.offsetWidth;
        board.classList.add("show");

        setTimeout(() => {
          if (typeof playStartGameSound === 'function') playStartGameSound();
        }, 1500);
      }
    });
  }
  
  // ===============================
  //   AUTHENTIFICATION (v1)
  // ===============================

  document.getElementById("closeAuthBtn").addEventListener("click", () => {
    playClickSound();
    document.getElementById("authOverlay").classList.add("hidden");
  });

  document.getElementById("closeSignupBtn").addEventListener("click", () => {
    playClickSound();
    document.getElementById("signupModal").classList.add("hidden");
    document.getElementById("authOverlay").classList.remove("hidden");
  });

  // --- SIGNUP ---

  document.getElementById("signupBtn").addEventListener("click", () => {
    playClickSound();
    document.getElementById("authOverlay").classList.add("hidden");
    document.getElementById("signupModal").classList.remove("hidden");
  });

  document.getElementById("signupConfirmBtn").addEventListener("click", async () => {
  playClickSound();

  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value.trim();
  const pseudo = document.getElementById("signupPseudoInput").value.trim();

  if (!email || !password || !pseudo) {
    alert("Merci de remplir tous les champs.");
    return;
  }

  // Vérification pseudo unique
  const { data: existingPseudo, error: checkPseudoError } = await supa
    .from("players")
    .select("id")
    .eq("pseudo", pseudo)
    .maybeSingle();

  if (checkPseudoError && checkPseudoError.code !== "PGRST116") {
    console.error("Erreur SELECT pseudo :", checkPseudoError);
    alert("Erreur interne.");
    return;
  }

  if (existingPseudo) {
    alert("Ce pseudo est déjà pris.");
    return;
  }

  // Inscription de l'utilisateur
  const { data: signupData, error: signupError } = await supa.auth.signUp({
    email,
    password
  });

  if (signupError) {
    console.error("Erreur lors de l'inscription :", signupError);
    alert("Erreur lors de l'inscription : " + signupError.message);
    return;
  }

  // Connexion automatique après l'inscription
  const { error: signinError, data: signinData } = await supa.auth.signInWithPassword({
    email,
    password
  });

  if (signinError) {
    console.error("Erreur lors de la connexion après inscription :", signinError);
    alert("Erreur lors de la connexion : " + signinError.message);
    return;
  }

  // Récupérer la session après la connexion
  const { data: { session }, error: sessionError } = await supa.auth.getSession();

  if (sessionError || !session) {
    console.error("Erreur récupération session :", sessionError);
    alert("Impossible de récupérer la session.");
    return;
  }

  // Stocker le JWT après connexion
  localStorage.setItem('supabase.access.token', session.access_token);
  localStorage.setItem('supabase.refresh.token', session.refresh_token);

  const userId = session.user.id;
  console.log("ID de l'utilisateur :", userId);

  // Vérifier si le joueur existe déjà dans la table players
  const { data: existingPlayer, error: checkPlayerError } = await supa
    .from("players")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (checkPlayerError && checkPlayerError.code !== "PGRST116") {
    console.error("Erreur SELECT player :", checkPlayerError);
    alert("Erreur interne.");
    return;
  }

  // Insertion dans players
  if (existingPlayer) {
    console.log("Le joueur existe déjà dans la table players, mise à jour du pseudo...");

    const { error: updateError } = await supa
      .from("players")
      .update({
        pseudo: pseudo
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Erreur UPDATE player :", updateError);
      alert("Erreur lors de la mise à jour du joueur : " + updateError.message);
    } else {
      console.log("Pseudo mis à jour avec succès dans la table players.");
    }
  } else {
    console.log("Insertion d'un nouveau joueur dans la table players...");
    const { error: insertError } = await supa
      .from("players")
      .insert({
        id: userId,
        pseudo: pseudo,
        created_at: new Date().toISOString(),
        premium: false
      });

    if (insertError) {
      console.error("Erreur INSERT player :", insertError);
      alert("Erreur lors de l’enregistrement du joueur : " + insertError.message);
    } else {
      console.log("Joueur inséré avec succès dans la table players.");
    }
  }

  // Mise à jour UI
  updateAuthUI(session.user);

  // Fermeture modals
  document.getElementById("signupModal").classList.add("hidden");
  playSound("successSound");
  alert("Compte créé ! Bienvenue dans le jeu.");
});

// --- LOGIN ---
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

  try {
    // 1. Connexion
    const { data, error } = await supa.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("Erreur de connexion :", error);
      alert("Erreur : " + error.message);
      return;
    }

    // 2. Récupération de la session
    const { data: { session }, error: sessionError } = await supa.auth.getSession();
    if (sessionError || !session) {
      console.error("Erreur récupération session :", sessionError);
      alert("Impossible de récupérer la session.");
      return;
    }

    // 3. Stockage des tokens
    localStorage.setItem('supabase.access.token', session.access_token);
    localStorage.setItem('supabase.refresh.token', session.refresh_token);

    // 4. Mise à jour du profil IMMEDIATEMENT (NOUVEAU)
    await updateProfileInfo().catch(err => {
      console.error("Erreur mise à jour profil :", err);
    });

    // 5. Récupération du meilleur score
    const bestScoreData = await fetchBestScore(session.user.id).catch(err => {
      console.error("Erreur récupération score :", err);
      return null;
    });
    if (bestScoreData) {
      saveBestScore(bestScoreData);
      console.log("Meilleur score récupéré et sauvegardé :", bestScoreData);
    }

    // 6. Mise à jour de l'UI
    await updateAuthUI(session.user).catch(err => {
      console.error("Erreur dans updateAuthUI :", err);
    });

    // 7. Récupération du pseudo (déjà présent dans votre code)
    if (session.user) {
      const pseudo = await fetchPlayerPseudo(session.user.id).catch(err => {
        console.error("Erreur récupération pseudo :", err);
        return null;
      });
      if (pseudo) localStorage.setItem("playerPseudo", pseudo);
    }

    // 8. Fermeture de la modale et mise à jour du score
    document.getElementById("authOverlay").classList.add("hidden");
    updateBestScoreTop();

    // 9. Réinitialisation du menu profil (NOUVEAU)
    const profileBtn = document.getElementById("profileBtn");
    if (profileBtn) {
      profileBtn.disabled = false; // Force l'activation
      console.log("Bouton profil activé après connexion");
    }

    // 10. Affichage message de succès
    alert("Connexion réussie !");

  } catch (err) {
    console.error("Erreur inattendue lors de la connexion :", err);
    alert("Une erreur inattendue est survenue.");
  }
});

// Fonctions utilitaires simplifiées
async function fetchBestScore(userId) {
  if (!userId) return null;

  try {
    const token = localStorage.getItem('supabase.access.token');
    if (!token) return null;

    supa.auth.setSession(token);

    const { data, error } = await supa
      .from("scores")
      .select("score, duration_ms, returnsUsed:undo_count, jokersUsed:jokers_used, created_at")
      .eq("player_id", userId)
      .order("score", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error("Erreur fetchBestScore:", error);
      return null;
    }

    return data ? {
      ...data,
      duration: Math.floor(data.duration_ms / 1000)
    } : null;

  } catch (err) {
    console.error("Erreur inattendue fetchBestScore:", err);
    return null;
  }
}

// ===============================
//   WHY SIGNUP
// ===============================

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
console.log("[DOMContentLoaded] Fin de l'initialisation");
});
