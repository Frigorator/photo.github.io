
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

const originalCanvas = document.createElement("canvas");
const originalCtx = originalCanvas.getContext("2d");

const filters = {
  original: "none",
  vintage: "sepia(0.85) contrast(1.1) saturate(0.85)",
  bw: "grayscale(1) contrast(1.15)",
  neon: "saturate(2.2) contrast(1.2) hue-rotate(10deg)"
};

let stream = null;
let mediaRecorder = null;
let recordedChunks = [];
let photoCaptured = false;
let currentFilter = "original";
let facingMode = "environment";
let photoUrl = null;
let videoUrl = null;
let recordingCanvas = null;
let recordingCtx = null;
let animationFrame = null;
let recording = false;
let recordingStream = null;

// ---------- CAMÉRA ----------

async function startCamera() {
  stopCamera();

  if (!navigator.mediaDevices?.getUserMedia) {
    statusText.textContent =
      "Caméra indisponible : utilise HTTPS ou localhost.";
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

    // Les filtres sont disponibles avant la capture vidéo.
    editor.hidden = false;
    videoResult.hidden = true;

    updateFilterButtons();
    updatePreviewFilter();

    statusText.textContent =
      "Caméra prête ! Choisis un filtre avant de filmer.";
  } catch (error) {
    console.error(error);
    statusText.textContent =
      "Accès caméra refusé ou indisponible. Vérifie les autorisations.";
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  video.srcObject = null;
}

// ---------- FILTRES ----------

function updateFilterButtons() {
  document.querySelectorAll(".filter-btn").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.filter === currentFilter
    );
  });
}

function updatePreviewFilter() {
  // Aperçu du filtre en direct dans la caméra.
  video.style.filter = filters[currentFilter];
}

function selectFilter(filterName) {
  if (!Object.hasOwn(filters, filterName)) return;

  currentFilter = filterName;
  updateFilterButtons();
  updatePreviewFilter();

  if (photoCaptured) {
    renderFilteredPhoto();
  }

  statusText.textContent = recording
    ? "Enregistrement en cours avec le filtre " + filterName + "."
    : "Filtre sélectionné : " + filterName;
}

// ---------- PHOTO ----------

function takePhoto() {
  if (!stream || !video.videoWidth) {
    statusText.textContent = "Attends que la caméra soit prête.";
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Conserve une copie de l'image originale.
  originalCanvas.width = video.videoWidth;
  originalCanvas.height = video.videoHeight;
  originalCtx.drawImage(
    video, 0, 0, originalCanvas.width, originalCanvas.height
  );

  photoCaptured = true;
  renderFilteredPhoto();

  photo.hidden = false;
  video.hidden = true;
  placeholder.hidden = true;

  editor.hidden = false;
  videoResult.hidden = true;

  takePhotoBtn.disabled = true;
  recordVideoBtn.disabled = true;
  switchCameraBtn.disabled = true;

  statusText.textContent = "Photo prise ! Tu peux changer de filtre.";

  stopCamera();
  startCameraBtn.textContent = "📷 Reprendre une photo";
}

function renderFilteredPhoto() {
  if (!photoCaptured) return;

  canvas.width = originalCanvas.width;
  canvas.height = originalCanvas.height;

  ctx.filter = filters[currentFilter];
  ctx.drawImage(originalCanvas, 0, 0);
  ctx.filter = "none";

  if (photoUrl) {
    URL.revokeObjectURL(photoUrl);
    photoUrl = null;
  }

  canvas.toBlob(blob => {
    if (!blob) return;

    photoUrl = URL.createObjectURL(blob);
    photo.src = photoUrl;
  }, "image/png");

  updateFilterButtons();
}

function downloadPhoto() {
  if (!photoCaptured) {
    statusText.textContent = "Prends d'abord une photo.";
    return;
  }

  canvas.toBlob(blob => {
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `photofilter-${currentFilter}.png`;
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

// ---------- VIDÉO AVEC FILTRE ----------

function drawVideoFrame() {
  if (!recording || !recordingCtx || !video.videoWidth) return;

  recordingCtx.filter = filters[currentFilter];

  recordingCtx.drawImage(
    video,
    0,
    0,
    recordingCanvas.width,
    recordingCanvas.height
  );

  recordingCtx.filter = "none";

  animationFrame = requestAnimationFrame(drawVideoFrame);
}

function recordVideo() {
  if (!stream || !video.videoWidth) {
    statusText.textContent = "Active d'abord la caméra.";
    return;
  }

  if (!window.MediaRecorder ||
      !HTMLCanvasElement.prototype.captureStream) {
    statusText.textContent =
      "L'enregistrement vidéo filtré n'est pas pris en charge par ce navigateur.";
    return;
  }

  if (recording && mediaRecorder) {
    mediaRecorder.stop();
    return;
  }

  recordedChunks = [];

  // Canvas dédié à la vidéo : il ne modifie pas la photo.
  recordingCanvas = document.createElement("canvas");
  recordingCanvas.width = video.videoWidth;
  recordingCanvas.height = video.videoHeight;
  recordingCtx = recordingCanvas.getContext("2d");

  recording = true;
  drawVideoFrame();

  // Capture les images du canvas filtré.
  const filteredStream = recordingCanvas.captureStream(30);

  // Ajoute le son du micro à la vidéo filtrée.
  const audioTrack = stream.getAudioTracks()[0];
  if (audioTrack) {
    filteredStream.addTrack(audioTrack);
  }

  recordingStream = filteredStream;

  const mimeType = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ].find(type => MediaRecorder.isTypeSupported(type));

  try {
    mediaRecorder = new MediaRecorder(
      recordingStream,
      mimeType ? { mimeType } : undefined
    );

    mediaRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.onerror = event => {
      console.error(event);
      statusText.textContent = "Une erreur est survenue pendant l'enregistrement.";
    };

    mediaRecorder.onstop = () => {
      recording = false;

      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }

      if (recordingStream) {
        // Arrête uniquement les pistes du canvas.
        recordingStream.getVideoTracks().forEach(track => track.stop());
        recordingStream = null;
      }

      const blob = new Blob(recordedChunks, {
        type: mediaRecorder.mimeType || "video/webm"
      });

      if (videoUrl) URL.revokeObjectURL(videoUrl);

      videoUrl = URL.createObjectURL(blob);
      recordedVideo.src = videoUrl;

      videoResult.hidden = false;
      editor.hidden = true;

      recordVideoBtn.textContent = "🎥 Enregistrer une vidéo";
      statusText.textContent =
        "Vidéo enregistrée avec le filtre " + currentFilter + " !";
    };

    mediaRecorder.start(250);

    recordVideoBtn.textContent = "⏹️ Arrêter l'enregistrement";
    statusText.textContent =
      "Enregistrement avec le filtre " + currentFilter + "…";
  } catch (error) {
    console.error(error);
    recording = false;

    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    recordingStream?.getTracks().forEach(track => track.stop());
    recordingStream = null;

    statusText.textContent = "Impossible de démarrer l'enregistrement.";
  }
}

function downloadVideo() {
  if (!videoUrl) {
    statusText.textContent = "Enregistre d'abord une vidéo.";
    return;
  }

  const link = document.createElement("a");
  link.href = videoUrl;
  link.download = `photofilter-${currentFilter}.webm`;
  link.click();
}

// ---------- NOUVELLE CAPTURE ----------

async function retakePhoto() {
  if (recording && mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
  }

  photoCaptured = false;

  if (photoUrl) {
    URL.revokeObjectURL(photoUrl);
    photoUrl = null;
  }

  editor.hidden = true;
  videoResult.hidden = true;

  photo.hidden = true;
  video.hidden = false;
  placeholder.hidden = false;

  takePhotoBtn.disabled = false;
  recordVideoBtn.disabled = false;
  switchCameraBtn.disabled = false;

  await startCamera();
}

async function switchCamera() {
  if (recording) return;

  facingMode = facingMode === "environment" ? "user" : "environment";
  await startCamera();
}

// ---------- ÉVÉNEMENTS ----------

startCameraBtn.addEventListener("click", startCamera);
takePhotoBtn.addEventListener("click", takePhoto);
recordVideoBtn.addEventListener("click", recordVideo);
switchCameraBtn.addEventListener("click", switchCamera);

document.querySelectorAll(".filter-btn").forEach(button => {
  button.addEventListener("click", () => {
    selectFilter(button.dataset.filter);
  });
});

document.getElementById("downloadPhoto")
  .addEventListener("click", downloadPhoto);

document.getElementById("downloadVideo")
  .addEventListener("click", downloadVideo);

document.getElementById("retakePhoto")
  .addEventListener("click", retakePhoto);

// ---------- PWA ----------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
      console.log("PhotoFilter PWA prête.");
    } catch (error) {
      console.error("Erreur PWA :", error);
    }
  });
}

window.addEventListener("pagehide", () => {
  recording = false;

  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
  }

  stopCamera();

  recordingStream?.getTracks().forEach(track => track.stop());

  if (photoUrl) URL.revokeObjectURL(photoUrl);
  if (videoUrl) URL.revokeObjectURL(videoUrl);
});
