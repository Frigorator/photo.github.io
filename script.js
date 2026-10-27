
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
  // Sélection des filtres photo uniquement
  document.querySelectorAll("#editor .filter-btn").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.filter === currentFilter
    );
  });

  // Sélection des filtres vidéo uniquement
document.querySelectorAll(".video-filter-btn").forEach(button => {
  button.addEventListener("click", () => {
    selectedVideoFilter = button.dataset.videoFilter;

    document.querySelectorAll(".video-filter-btn").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    videoFilterStatus.textContent =
      "Filtre sélectionné : " + selectedVideoFilter;
  });
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
      saveOriginalRecordedVideo(blob);

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

const videoFilterCanvas = document.getElementById("videoFilterCanvas");
const videoFilterCtx = videoFilterCanvas.getContext("2d");

const videoFilterStatus = document.getElementById("videoFilterStatus");
const applyVideoFilterBtn = document.getElementById("applyVideoFilter");
const downloadVideoBtn = document.getElementById("downloadVideo");
const processedVideo = document.getElementById("processedVideo");

let selectedVideoFilter = "original";
let originalRecordedBlob = null;
let processedVideoUrl = null;
let videoProcessing = false;

// Conserver la vidéo originale avant toute retouche.
// À appeler dans mediaRecorder.onstop, après la création du Blob.

function saveOriginalRecordedVideo(blob) {
  originalRecordedBlob = blob;

  if (processedVideoUrl) {
    URL.revokeObjectURL(processedVideoUrl);
    processedVideoUrl = null;
  }

  processedVideo.hidden = true;
  downloadVideoBtn.disabled = true;
  videoFilterStatus.textContent = "Vidéo originale prête à retoucher.";
}

// Sélection d'un filtre après l'enregistrement.
document.querySelectorAll("[data-video-filter]").forEach(button => {
  button.addEventListener("click", () => {
    selectedVideoFilter = button.dataset.videoFilter;

    document.querySelectorAll("[data-video-filter]").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    videoFilterStatus.textContent =
      "Filtre sélectionné : " + selectedVideoFilter;
  });
});


applyVideoFilterBtn.addEventListener("click", async () => {
  console.log("Bouton Créer la vidéo filtrée cliqué");

  if (!originalRecordedBlob) {
    videoFilterStatus.textContent =
      "Aucune vidéo originale disponible. Enregistre une vidéo d'abord.";
    return;
  }

  if (videoProcessing) {
    videoFilterStatus.textContent =
      "Le traitement est déjà en cours.";
    return;
  }

  videoProcessing = true;
  applyVideoFilterBtn.disabled = true;
  videoFilterStatus.textContent = "Préparation de la vidéo…";

  const sourceUrl = URL.createObjectURL(originalRecordedBlob);
  const sourceVideo = document.createElement("video");

  sourceVideo.muted = true;
  sourceVideo.playsInline = true;
  sourceVideo.preload = "auto";
  sourceVideo.src = sourceUrl;

  let outputStream;

  try {
    await new Promise((resolve, reject) => {
      sourceVideo.onloadedmetadata = resolve;
      sourceVideo.onerror = () =>
        reject(new Error("Impossible de lire la vidéo originale."));
    });

    videoFilterCanvas.width = sourceVideo.videoWidth;
    videoFilterCanvas.height = sourceVideo.videoHeight;

    outputStream = videoFilterCanvas.captureStream(25);

    const mimeType = [
      "video/webm;codecs=vp8",
      "video/webm"
    ].find(type => MediaRecorder.isTypeSupported(type));

    const recorder = new MediaRecorder(
      outputStream,
      mimeType ? { mimeType } : undefined
    );

    const chunks = [];

    const finished = new Promise((resolve, reject) => {
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      recorder.onerror = () =>
        reject(new Error("Erreur pendant la création de la vidéo."));

      recorder.onstop = () => resolve(new Blob(chunks, {
        type: recorder.mimeType || "video/webm"
      }));
    });

    const drawFrame = () => {
      videoFilterCtx.filter = filters[selectedVideoFilter] || "none";

      videoFilterCtx.drawImage(
        sourceVideo,
        0,
        0,
        videoFilterCanvas.width,
        videoFilterCanvas.height
      );

      videoFilterCtx.filter = "none";
    };

    // Dessiner une première image avant le démarrage
    drawFrame();

    recorder.start(250);
    videoFilterStatus.textContent = "Création de la vidéo filtrée…";

    let animationId;

    const render = () => {
      if (sourceVideo.ended || sourceVideo.paused) return;

      drawFrame();
      animationId = requestAnimationFrame(render);
    };

    sourceVideo.onended = () => {
      cancelAnimationFrame(animationId);

      // Dernière image, puis arrêt de l'enregistrement
      drawFrame();

      if (recorder.state === "recording") {
        recorder.stop();
      }
    };

    await sourceVideo.play();
    render();

    const resultBlob = await finished;

    if (!resultBlob.size) {
      throw new Error("La vidéo créée est vide.");
    }

    if (processedVideoUrl) {
      URL.revokeObjectURL(processedVideoUrl);
    }

    processedVideoUrl = URL.createObjectURL(resultBlob);
    processedVideo.src = processedVideoUrl;
    processedVideo.hidden = false;
    processedVideo.load();

    downloadVideoBtn.disabled = false;
    videoFilterStatus.textContent =
      "Vidéo filtrée créée avec le filtre " + selectedVideoFilter + " !";

  } catch (error) {
    console.error("Erreur de traitement vidéo :", error);
    videoFilterStatus.textContent = "Erreur : " + error.message;

  } finally {
    outputStream?.getTracks().forEach(track => track.stop());
    sourceVideo.pause();
    sourceVideo.removeAttribute("src");
    sourceVideo.load();
    URL.revokeObjectURL(sourceUrl);

    videoProcessing = false;
    applyVideoFilterBtn.disabled = false;
  }
});


    // Dessiner les images de la vidéo avec le filtre choisi.
    let drawing = false;

    function drawFilteredFrame() {
      if (sourceVideo.ended || sourceVideo.paused) return;

      if (!drawing) {
        drawing = true;

        videoFilterCtx.filter = filters[selectedVideoFilter] || "none";

        videoFilterCtx.drawImage(
          sourceVideo,
          0,
          0,
          videoFilterCanvas.width,
          videoFilterCanvas.height
        );

        videoFilterCtx.filter = "none";
        drawing = false;
      }

      requestAnimationFrame(drawFilteredFrame);
    }

    sourceVideo.currentTime = 0;

    await new Promise((resolve, reject) => {
      sourceVideo.onseeked = resolve;
      sourceVideo.onerror = () =>
        reject(new Error("Impossible de démarrer le traitement."));
    });

    // Produire des images filtrées à vitesse normale.
    recorder.start(250);

    const renderFrame = () => {
      if (sourceVideo.ended) {
        if (recorder.state === "recording") recorder.stop();
        return;
      }

      videoFilterCtx.filter = filters[selectedVideoFilter] || "none";

      videoFilterCtx.drawImage(
        sourceVideo,
        0,
        0,
        videoFilterCanvas.width,
        videoFilterCanvas.height
      );

      videoFilterCtx.filter = "none";
    };

    // Le lecteur joue pendant que les images sont capturées.
    sourceVideo.onended = () => {
      if (recorder.state === "recording") recorder.stop();
    };

    sourceVideo.requestVideoFrameCallback &&
      sourceVideo.requestVideoFrameCallback(function frameCallback() {
        renderFrame();

        if (!sourceVideo.ended) {
          sourceVideo.requestVideoFrameCallback(frameCallback);
        }
      });

    // Repli pour les navigateurs sans requestVideoFrameCallback.
    if (!sourceVideo.requestVideoFrameCallback) {
      const interval = setInterval(() => {
        if (sourceVideo.ended) {
          clearInterval(interval);
          return;
        }
        renderFrame();
      }, 1000 / 30);
    }

    await sourceVideo.play();

    videoFilterStatus.textContent =
      "Traitement de la vidéo en cours…";

    // Protection contre un traitement qui resterait bloqué.
    timeoutId = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, Math.max(30000, (sourceVideo.duration + 10) * 1000));

    const processedBlob = await recordingFinished;
    clearTimeout(timeoutId);

    if (!processedBlob.size) {
      throw new Error("Le fichier vidéo obtenu est vide.");
    }

    if (processedVideoUrl) URL.revokeObjectURL(processedVideoUrl);

    processedVideoUrl = URL.createObjectURL(processedBlob);
    processedVideo.src = processedVideoUrl;
    processedVideo.hidden = false;

    downloadVideoBtn.disabled = false;

    videoFilterStatus.textContent =
      "Vidéo filtrée créée : " + selectedVideoFilter + ".";

  } catch (error) {
    console.error(error);

    if (timeoutId) clearTimeout(timeoutId);

    if (recorder?.state === "recording") {
      recorder.stop();
    }

    videoFilterStatus.textContent =
      "Erreur de traitement : " + error.message;

  } finally {
    outputStream?.getTracks().forEach(track => track.stop());
    sourceVideo.pause();
    sourceVideo.removeAttribute("src");
    sourceVideo.load();
    URL.revokeObjectURL(sourceUrl);

    videoProcessing = false;
    applyVideoFilterBtn.disabled = false;
  }
});

// Télécharger le résultat filtré.
downloadVideoBtn.addEventListener("click", () => {
  if (!processedVideoUrl) return;

  const link = document.createElement("a");
  link.href = processedVideoUrl;
  link.download = `photofilter-${selectedVideoFilter}.webm`;
  link.click();
});

