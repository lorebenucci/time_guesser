const MAX_YEAR_SCORE = 5000;
const MAX_LOC_SCORE = 5000;
const YEAR_PENALTY_PER_YEAR = 200;
const LOC_PENALTY_PER_KM = 5;

const DEFAULT_YEAR = 2005;
const YEAR_MIN = 1980;
const YEAR_MAX = 2025;

const MAP_CENTER = [45.5, 13.0];
const MAP_ZOOM = 4;

let photos = [];
let currentIndex = 0;
let totalScore = 0;
let map = null;
let guessMarker = null;
let actualMarker = null;
let revealLine = null;
let confirmed = false;
let lastLoadError = "";

const el = {
  startScreen:    document.getElementById("startScreen"),
  gameScreen:     document.getElementById("gameScreen"),
  finalScreen:    document.getElementById("finalScreen"),
  startButton:    document.getElementById("startButton"),
  restartButton:  document.getElementById("restartButton"),
  confirmButton:  document.getElementById("confirmButton"),
  nextButton:     document.getElementById("nextButton"),
  foundPhotos:    document.getElementById("foundPhotos"),
  setupHint:      document.getElementById("setupHint"),
  score:          document.getElementById("score"),
  photoCounter:   document.getElementById("photoCounter"),
  progressFill:   document.getElementById("progressFill"),
  progressLabel:  document.getElementById("progressLabel"),
  photoLabel:     document.getElementById("photoLabel"),
  photoImg:       document.getElementById("photoImg"),
  yearSlider:     document.getElementById("yearSlider"),
  yearDisplay:    document.getElementById("yearDisplay"),
  feedback:       document.getElementById("feedback"),
  resultPanel:    document.getElementById("resultPanel"),
  actualYear:     document.getElementById("actualYear"),
  guessedYearEl:  document.getElementById("guessedYearEl"),
  yearScoreEl:    document.getElementById("yearScoreEl"),
  distanceKmEl:   document.getElementById("distanceKmEl"),
  locScoreEl:     document.getElementById("locScoreEl"),
  roundScoreEl:   document.getElementById("roundScoreEl"),
  finalScore:     document.getElementById("finalScore"),
  finalMax:       document.getElementById("finalMax"),
  finalMessage:   document.getElementById("finalMessage"),
};

el.startButton.addEventListener("click", startGame);
el.restartButton.addEventListener("click", restart);
el.confirmButton.addEventListener("click", confirmGuess);
el.nextButton.addEventListener("click", nextPhoto);
el.yearSlider.addEventListener("input", onYearSlide);

loadPhotoCount();

async function loadPhotoCount() {
  try {
    const data = await fetchJson("data/photos.json");
    if (data && data.length > 0) {
      el.foundPhotos.textContent = data.length;
    } else {
      el.foundPhotos.textContent = "0";
    }
  } catch {
    el.foundPhotos.textContent = "—";
  }
}

async function startGame() {
  el.startButton.disabled = true;
  el.setupHint.textContent = "Caricamento in corso…";

  try {
    photos = await fetchJson("data/photos.json");

    if (!photos || photos.length === 0) {
      el.setupHint.textContent = getNoDataMessage();
      el.startButton.disabled = false;
      return;
    }

    shuffle(photos);

    currentIndex = 0;
    totalScore = 0;

    showOnly(el.gameScreen);
    initMap();
    loadPhoto(currentIndex);
    updateScoreDisplay();
    updateProgress();
  } catch (err) {
    console.error(err);
    el.setupHint.textContent = "Errore nel caricamento di data/photos.json.";
    el.startButton.disabled = false;
  }
}

function restart() {
  cleanupMapOverlays();
  if (map) {
    map.remove();
    map = null;
  }
  photos = [];
  currentIndex = 0;
  totalScore = 0;
  confirmed = false;
  guessMarker = null;
  actualMarker = null;
  revealLine = null;

  el.startButton.disabled = false;
  el.setupHint.textContent = "Carico la lista foto da data/photos.json";
  showOnly(el.startScreen);
  loadPhotoCount();
}

function initMap() {
  map = L.map("map", { zoomControl: true }).setView(MAP_CENTER, MAP_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>",
    maxZoom: 18,
  }).addTo(map);

  map.on("click", onMapClick);
}

function onMapClick(e) {
  if (confirmed) return;

  if (guessMarker) {
    map.removeLayer(guessMarker);
  }

  guessMarker = L.marker(e.latlng, { icon: makeIcon("#4a9eff", 18) }).addTo(map);
  el.confirmButton.disabled = false;
  el.feedback.textContent = "Pin posizionato. Aggiusta l'anno se vuoi, poi conferma.";
}

function confirmGuess() {
  if (!guessMarker || confirmed) return;
  confirmed = true;

  map.off("click", onMapClick);

  const photo = photos[currentIndex];
  const guessYear = parseInt(el.yearSlider.value, 10);
  const guessLatLng = guessMarker.getLatLng();

  const yearPts = calcYearScore(guessYear, photo.year);
  const distKm = haversine(guessLatLng.lat, guessLatLng.lng, photo.lat, photo.lon);
  const locPts = calcLocScore(distKm);
  const roundPts = yearPts + locPts;

  totalScore += roundPts;

  actualMarker = L.marker([photo.lat, photo.lon], { icon: makeIcon("#f2bf57", 22) })
    .addTo(map)
    .bindPopup(photo.place ? `<b>${photo.place}</b>` : "Posizione reale")
    .openPopup();

  if (distKm > 0.5) {
    revealLine = L.polyline(
      [guessLatLng, [photo.lat, photo.lon]],
      { color: "#f2bf57", weight: 2, dashArray: "6 6", opacity: 0.7 }
    ).addTo(map);

    map.fitBounds(
      L.latLngBounds([guessLatLng, [photo.lat, photo.lon]]),
      { padding: [50, 50], maxZoom: 12 }
    );
  } else {
    map.setView([photo.lat, photo.lon], 12);
  }

  showResults(guessYear, photo.year, yearPts, distKm, locPts, roundPts);
  updateScoreDisplay();
  updateProgress();

  el.confirmButton.classList.add("hidden");
  el.nextButton.classList.remove("hidden");
  el.nextButton.focus();
}

function nextPhoto() {
  currentIndex += 1;

  if (currentIndex >= photos.length) {
    showFinal();
    return;
  }

  cleanupMapOverlays();
  confirmed = false;
  guessMarker = null;
  actualMarker = null;
  revealLine = null;

  map.setView(MAP_CENTER, MAP_ZOOM);
  map.on("click", onMapClick);

  el.yearSlider.value = DEFAULT_YEAR;
  el.yearDisplay.textContent = DEFAULT_YEAR;

  el.confirmButton.disabled = true;
  el.confirmButton.classList.remove("hidden");
  el.nextButton.classList.add("hidden");
  el.resultPanel.classList.add("hidden");
  el.feedback.textContent = "Scegli l'anno e posiziona il pin sulla mappa.";

  loadPhoto(currentIndex);
  updateProgress();
}

function loadPhoto(index) {
  const photo = photos[index];
  el.photoLabel.textContent = `Foto ${index + 1}`;
  el.photoImg.src = `media/${photo.file}`;
  el.photoImg.alt = `Foto ${index + 1}`;
  el.photoCounter.textContent = `${index + 1} / ${photos.length}`;
}

function showResults(guessYear, realYear, yearPts, distKm, locPts, roundPts) {
  el.actualYear.textContent = realYear;
  el.guessedYearEl.textContent = guessYear;
  el.yearScoreEl.textContent = `+${yearPts}`;

  el.distanceKmEl.textContent = distKm < 1
    ? "< 1 km"
    : `${Math.round(distKm).toLocaleString("it")} km`;

  el.locScoreEl.textContent = `+${locPts}`;
  el.roundScoreEl.textContent = `+${roundPts}`;

  el.resultPanel.classList.remove("hidden");

  const diff = Math.abs(guessYear - realYear);
  let yearMsg = diff === 0 ? "Anno esatto!" : `${diff} ann${diff === 1 ? "o" : "i"} di errore.`;
  let locMsg = distKm < 10
    ? "Posizione quasi perfetta!"
    : distKm < 100
    ? `A ${Math.round(distKm)} km.`
    : `A ${Math.round(distKm).toLocaleString("it")} km.`;

  el.feedback.textContent = `${yearMsg} ${locMsg} +${roundPts} punti questa foto.`;
}

function showFinal() {
  const maxScore = photos.length * (MAX_YEAR_SCORE + MAX_LOC_SCORE);
  const pct = maxScore === 0 ? 0 : Math.round((totalScore / maxScore) * 100);

  el.finalScore.textContent = totalScore.toLocaleString("it");
  el.finalMax.textContent = `/ ${maxScore.toLocaleString("it")}`;
  el.finalMessage.textContent = getFinalMessage(pct);
  showOnly(el.finalScreen);
}

function getFinalMessage(pct) {
  if (pct >= 90) return "Memoria fotografica assoluta. Lo conosci meglio di chiunque altro.";
  if (pct >= 70) return "Ottimo risultato: ci sei andato molto vicino.";
  if (pct >= 45) return "Buona prova. Qualche anno di differenza, qualche km di troppo.";
  if (pct >= 20) return "Ci hai provato. Forse avresti dovuto andare più spesso alle sue feste.";
  return "Sei sicuro di conoscerlo? Prossima volta studia l'album di famiglia.";
}

function calcYearScore(guessYear, realYear) {
  const diff = Math.abs(guessYear - realYear);
  return Math.max(0, MAX_YEAR_SCORE - diff * YEAR_PENALTY_PER_YEAR);
}

function calcLocScore(distKm) {
  return Math.max(0, Math.round(MAX_LOC_SCORE - distKm * LOC_PENALTY_PER_KM));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function makeIcon(color, size) {
  const half = size / 2;
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;
      border-radius:50%;
      background:${color};
      border:3px solid rgba(255,255,255,0.9);
      box-shadow:0 2px 10px rgba(0,0,0,0.6);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [half, half],
  });
}

function cleanupMapOverlays() {
  if (!map) return;
  if (guessMarker)  { map.removeLayer(guessMarker);  }
  if (actualMarker) { map.removeLayer(actualMarker); }
  if (revealLine)   { map.removeLayer(revealLine);   }
}

function updateScoreDisplay() {
  el.score.textContent = totalScore.toLocaleString("it");
}

function updateProgress() {
  const pct = photos.length === 0 ? 0 : Math.round((currentIndex / photos.length) * 100);
  el.progressFill.style.width = `${pct}%`;
  el.progressLabel.textContent = `${pct}%`;
}

function onYearSlide() {
  el.yearDisplay.textContent = el.yearSlider.value;
}

function showOnly(screen) {
  [el.startScreen, el.gameScreen, el.finalScreen].forEach((s) => {
    s.classList.toggle("hidden", s !== screen);
  });
}

async function fetchJson(path) {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    lastLoadError = err?.message || "fetch-error";
    return null;
  }
}

function getNoDataMessage() {
  if (window.location.protocol === "file:") {
    return "Apri il gioco tramite server HTTP (es. http://localhost:8000), non come file://";
  }
  return "Nessuna foto trovata. Controlla che data/photos.json esista e sia compilato.";
}
