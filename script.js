
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const photo = document.getElementById("photo");
const placeholder = document.getElementById("placeholder");
const statusText = document.getElementById("status");

const startCameraBtn = document.getElementById("startCamera");
const takePhotoBtn = document.getElementById("takePhoto");
const recordVideoBtn = document.getElementById("recordVideo");
const switchCameraBtn = document.getElementById("switchCamera");

const editor = document.getElementById("editor");
const videoResult = document.getElementById("videoResult");
const recordedVideo = document.getElementById("recordedVideo");

let stream = null;
let mediaRecorder = null;
let recordedChunks = [];
let photoCaptured = false;
let currentFilter = "original";
let facingMode = "environment";
let photoUrl = null;
let videoUrl = null;

// Filtres disponibles
const filters = {
  original: "none",
  vintage: "sepia(0.85) contrast(1.1) saturate(0.85)",
  bw: "grayscale(1) contrast(1.15)",
  neon: "saturate(2.2) contrast(1.2) hue-rotate(10deg)"
};

// Active la caméra du téléphone
async function startCamera() {
  stopCamera();

  if (!navigator.mediaDevices?.getUserMedia) {
    statusText.textContent =
      "Caméra indisponible. Utilise HTTPS ou localhost.";
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    video.srcObject = stream;
    video.hidden = false;
    photo.hidden = true;
    placeholder.hidden = true;

    await video.play();

    startCameraBtn.textContent = "📷 Caméra activée";
    takePhotoBtn.disabled = false;
    recordVideoBtn.disabled = false;
    switchCameraBtn.disabled = false;

    statusText.textContent = "Caméra prête !";
  } catch (error) {
    console.error(error);
    statusText.textContent =
      "Impossible d'accéder à la caméra. Vérifie les autorisations.";
  }
}

// Arrête le flux de la caméra
function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  video.srcObject = null;
}

// Prend une photo
function takePhoto() {
  if (!stream || !video.videoWidth) {
    statusText.textContent = "Attends que la caméra soit prête.";
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Capture l'image originale sans filtre
  ctx.filter = "none";
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  photoCaptured = true;
  currentFilter = "original";

  photo.hidden = false;
  video.hidden = true;
  placeholder.hidden = true;

  applyFilter("original");

  editor.hidden = false;
  videoResult.hidden = true;

  statusText.textContent = "Photo prise ! Choisis ton filtre.";

  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.classList.remove("active");
  });

  stopCamera();
  startCameraBtn.textContent = "📷 Reprendre une photo";
  takePhotoBtn.disabled = true;
  recordVideoBtn.disabled = true;
  switchCameraBtn.disabled = true;
}

// Applique un filtre au contenu du canvas
function applyFilter(filterName) {
  if (!photoCaptured) return;

  currentFilter = filterName;

  const original = document.createElement("canvas");
  original.width = canvas.width;
  original.height = canvas.height;

  const originalCtx = original.getContext("2d");
  originalCtx.drawImage(canvas, 0, 0);

  // Le canvas source reste intact : chaque filtre repart de l'original.
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.filter = filters[filterName];
  ctx.drawImage(original, 0, 0);
  ctx.filter = "none";

  // Actualise l'aperçu
  if (photoUrl) {
    URL.revokeObjectURL(photoUrl);
  }

  canvas.toBlob(blob => {
    if (!blob) {
      statusText.textContent = "Erreur lors du traitement de la photo.";
      return;
    }

    photoUrl = URL.createObjectURL(blob);
    photo.src = photoUrl;
  }, "image/png");

  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.classList.toggle(
      "active",
      btn.dataset.filter === filterName
    );
  });

  statusText.textContent =
    "Filtre appliqué : " + filterName;
}

// Télécharge la photo filtrée
function downloadPhoto() {
  if (!photoCaptured) return;

  canvas.toBlob(blob => {
    if (!blob) {
      statusText.textContent = "Impossible de télécharger la photo.";
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `photofilter-${currentFilter}.png`;
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

// Enregistre une vidéo
function recordVideo() {
  if (!stream) {
    statusText.textContent = "Active d'abord la caméra.";
    return;
  }

  if (!window.MediaRecorder) {
    statusText.textContent =
      "L'enregistrement vidéo n'est pas pris en charge.";
    return;
  }

  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    return;
  }

  recordedChunks = [];

  const mimeType = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm"
  ].find(type => MediaRecorder.isTypeSupported(type));

  try {
    mediaRecorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined
    );

    mediaRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, {
        type: mediaRecorder.mimeType || "video/webm"
      });

      if (videoUrl) URL.revokeObjectURL(videoUrl);

      videoUrl = URL.createObjectURL(blob);
      recordedVideo.src = videoUrl;

      videoResult.hidden = false;
      editor.hidden = true;

      statusText.textContent = "Vidéo enregistrée !";
      recordVideoBtn.textContent = "🎥 Enregistrer une vidéo";
    };

    mediaRecorder.start();

    recordVideoBtn.textContent = "⏹️ Arrêter l'enregistrement";
    statusText.textContent = "Enregistrement en cours...";
  } catch (error) {
    console.error(error);
    statusText.textContent = "Impossible de démarrer l'enregistrement.";
  }
}

// Télécharge la vidéo enregistrée
function downloadVideo() {
  if (!videoUrl) return;

  const link = document.createElement("a");
  link.href = videoUrl;
  link.download = "ma-video.webm";
  link.click();
}

// Recommence une capture
function retakePhoto() {
  photoCaptured = false;
  currentFilter = "original";

  editor.hidden = true;
  videoResult.hidden = true;

  photo.hidden = true;
  video.hidden = false;

  startCamera();
}

// Change entre caméra avant et arrière
async function switchCamera() {
  facingMode = facingMode === "environment"
    ? "user"
    : "environment";

  await startCamera();
}

// Événements des boutons
startCameraBtn.addEventListener("click", startCamera);
takePhotoBtn.addEventListener("click", takePhoto);
recordVideoBtn.addEventListener("click", recordVideo);
switchCameraBtn.addEventListener("click", switchCamera);

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    applyFilter(btn.dataset.filter);
  });
});

document.getElementById("downloadPhoto")
  .addEventListener("click", downloadPhoto);

document.getElementById("downloadVideo")
  .addEventListener("click", downloadVideo);

document.getElementById("retakePhoto")
  .addEventListener("click", retakePhoto);

// Libère les ressources lors de la fermeture de la page
window.addEventListener("pagehide", () => {
  stopCamera();

  if (photoUrl) URL.revokeObjectURL(photoUrl);
  if (videoUrl) URL.revokeObjectURL(videoUrl);
});

/* Installation PWA : enregistrement du service worker */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        "./service-worker.js"
      );

      console.log(
        "PhotoFilter est prête pour le mode hors ligne.",
        registration.scope
      );
    } catch (error) {
      console.error(
        "Erreur lors de l'enregistrement du service worker :",
        error
      );
    }
  });
}

