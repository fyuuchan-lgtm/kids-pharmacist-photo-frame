(() => {
  "use strict";

  const JPEG_QUALITY = 0.92;
  const HOSPITAL_NAME = "知多半島総合医療センター";
  const OUTPUT_WIDTH = 1080;
  const OUTPUT_HEIGHT = 1920;
  const PHOTO_WINDOW = Object.freeze({ x: 200, y: 280, width: 680, height: 1320, radiusX: 122, radiusY: 92, radiusMode: "top" });
  const FRAME_OPTIONS = Object.freeze({
    certificate: Object.freeze({
      id: "certificate",
      label: "1A 認定フォト",
      path: "assets/frame-certificate-series-1-v14-approved-window.webp",
      hospitalName: HOSPITAL_NAME
    }),
    master: Object.freeze({
      id: "master",
      label: "2 おくすりマスター！",
      path: "assets/frame-pharmacy-master-2-v14-approved-window.webp",
      hospitalName: HOSPITAL_NAME
    }),
    future: Object.freeze({
      id: "future",
      label: "3 みらいのやくざいし！",
      path: "assets/frame-pharmacy-future-3-v14-approved-window.webp",
      hospitalName: HOSPITAL_NAME
    })
  });

  const elements = {
    browserHint: document.querySelector("#browserHint"),
    views: [...document.querySelectorAll(".view")],
    startView: document.querySelector("#startView"),
    cameraView: document.querySelector("#cameraView"),
    resultView: document.querySelector("#resultView"),
    doneView: document.querySelector("#doneView"),
    frameOptions: [...document.querySelectorAll(".js-frame-option")],
    frameSelectionStatus: document.querySelector("#frameSelectionStatus"),
    startCameraButton: document.querySelector("#startCameraButton"),
    backToStartButton: document.querySelector("#backToStartButton"),
    retryCameraButton: document.querySelector("#retryCameraButton"),
    switchCameraButton: document.querySelector("#switchCameraButton"),
    captureButton: document.querySelector("#captureButton"),
    choosePhotoButtons: [...document.querySelectorAll(".js-choose-photo")],
    photoInput: document.querySelector("#photoInput"),
    cameraStage: document.querySelector("#cameraStage"),
    cameraVideo: document.querySelector("#cameraVideo"),
    frameBase: document.querySelector("#cameraStage .frame-base"),
    cameraStatus: document.querySelector("#cameraStatus"),
    cameraError: document.querySelector("#cameraError"),
    cameraErrorMessage: document.querySelector("#cameraErrorMessage"),
    countdownOverlay: document.querySelector("#countdownOverlay"),
    resultStage: document.querySelector("#resultStage"),
    resultImage: document.querySelector("#resultImage"),
    resultStatus: document.querySelector("#resultStatus"),
    saveButton: document.querySelector("#saveButton"),
    retakeButton: document.querySelector("#retakeButton"),
    finishButton: document.querySelector("#finishButton"),
    restartButton: document.querySelector("#restartButton"),
    iosSaveHint: document.querySelector("#iosSaveHint"),
    canvas: document.querySelector("#composeCanvas")
  };

  const state = {
    stream: null,
    facingMode: "environment",
    selectedFrameId: "",
    frameImage: null,
    frameImagePath: "",
    frameLoadPromise: null,
    resultBlob: null,
    resultUrl: "",
    resultFile: null,
    resultExtension: "jpg",
    currentView: elements.startView,
    switchingCamera: false,
    countingDown: false
  };

  function selectedFrame() {
    return FRAME_OPTIONS[state.selectedFrameId] || null;
  }

  function showView(view) {
    elements.views.forEach((item) => { item.hidden = item !== view; });
    state.currentView = view;
    const heading = view.querySelector("h2");
    if (heading) heading.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function isLikelyInAppBrowser() {
    return /(Line\/|FBAN|FBAV|Instagram|Twitter|MicroMessenger|TikTok|wv\))/i.test(navigator.userAgent || "");
  }

  function isIos() {
    return /iP(ad|hone|od)/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function percent(value, total) {
    return `${(value / total) * 100}%`;
  }

  function photoRadiusCss() {
    const photo = PHOTO_WINDOW;
    const x = (photo.radiusX / photo.width) * 100;
    const y = (photo.radiusY / photo.height) * 100;
    return `${x}% ${x}% 0 0 / ${y}% ${y}% 0 0`;
  }

  function applyFrameToStage() {
    const frame = selectedFrame();
    if (!frame) return;
    const photo = PHOTO_WINDOW;
    const stage = elements.cameraStage;
    stage.style.setProperty("--photo-top", percent(photo.y, OUTPUT_HEIGHT));
    stage.style.setProperty("--photo-left", percent(photo.x, OUTPUT_WIDTH));
    stage.style.setProperty("--photo-width", percent(photo.width, OUTPUT_WIDTH));
    stage.style.setProperty("--photo-height", percent(photo.height, OUTPUT_HEIGHT));
    stage.style.setProperty("--photo-radius", photoRadiusCss());
    elements.frameBase.src = frame.path;
  }

  function setSelectedFrame(id) {
    if (!FRAME_OPTIONS[id]) return;
    state.selectedFrameId = id;
    state.frameImage = null;
    state.frameImagePath = "";
    state.frameLoadPromise = null;
    elements.frameOptions.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.frameId === id)));
    const frame = selectedFrame();
    elements.frameSelectionStatus.textContent = `${frame.label}を選択中。カメラをはじめるか、写真から選んでください。`;
    elements.startCameraButton.disabled = false;
    elements.choosePhotoButtons.forEach((button) => { button.disabled = false; });
    applyFrameToStage();
  }

  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }
    elements.cameraVideo.srcObject = null;
    elements.captureButton.disabled = true;
    elements.switchCameraButton.disabled = true;
    elements.cameraStage.classList.remove("is-ready");
    elements.countdownOverlay.hidden = true;
  }

  function resetCameraMessages() {
    elements.cameraError.hidden = true;
    elements.retryCameraButton.hidden = true;
    elements.cameraStatus.textContent = "カメラを準備しています…";
  }

  function explainCameraError(error) {
    const denied = error && (error.name === "NotAllowedError" || error.name === "SecurityError");
    const unavailable = error && (error.name === "NotFoundError" || error.name === "OverconstrainedError");
    if (!window.isSecureContext) return "カメラを使うには、SafariまたはChromeでHTTPSのページを開いてください。写真から選ぶ方法も使えます。";
    if (denied) return "カメラの許可がオフになっています。ブラウザの設定で許可するか、写真から選んでください。";
    if (unavailable) return "使えるカメラが見つかりませんでした。写真から選んでください。";
    return "カメラを開けませんでした。SafariまたはChromeで開き直すか、写真から選んでください。";
  }

  function showCameraError(error) {
    stopCamera();
    elements.cameraStatus.textContent = "";
    elements.cameraErrorMessage.textContent = explainCameraError(error);
    elements.cameraError.hidden = false;
    elements.retryCameraButton.hidden = false;
  }

  async function requestCamera(mode, allowFallback = true) {
    if (!selectedFrame()) {
      showView(elements.startView);
      return false;
    }
    applyFrameToStage();
    stopCamera();
    resetCameraMessages();
    elements.cameraStage.classList.toggle("is-front", mode === "user");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCameraError(new Error("MediaDevices unavailable"));
      return false;
    }
    const videoConstraints = {
      facingMode: allowFallback ? { ideal: mode } : { exact: mode },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
      state.stream = stream;
      const videoTrack = stream.getVideoTracks()[0];
      const reportedMode = videoTrack && typeof videoTrack.getSettings === "function" ? videoTrack.getSettings().facingMode : "";
      state.facingMode = reportedMode === "user" ? "user" : reportedMode ? "environment" : mode;
      elements.cameraStage.classList.toggle("is-front", state.facingMode === "user");
      elements.cameraVideo.srcObject = stream;
      await elements.cameraVideo.play();
      await waitForVideoDimensions();
      elements.cameraStage.classList.add("is-ready");
      elements.cameraStatus.textContent = "フレームに合わせたら、黄色いボタンを押してね。";
      elements.captureButton.disabled = false;
      elements.switchCameraButton.disabled = false;
      return true;
    } catch (error) {
      if (!allowFallback && error && error.name === "OverconstrainedError") return requestCamera(mode, true);
      showCameraError(error);
      return false;
    }
  }

  function waitForVideoDimensions() {
    if (elements.cameraVideo.videoWidth > 0 && elements.cameraVideo.videoHeight > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => { cleanup(); reject(new Error("Camera timed out")); }, 8000);
      const onReady = () => { cleanup(); resolve(); };
      const cleanup = () => { window.clearTimeout(timer); elements.cameraVideo.removeEventListener("loadedmetadata", onReady); };
      elements.cameraVideo.addEventListener("loadedmetadata", onReady, { once: true });
    });
  }

  async function startCamera() {
    if (!selectedFrame()) return;
    showView(elements.cameraView);
    await requestCamera(state.facingMode, true);
  }

  async function switchCamera() {
    if (state.switchingCamera) return;
    state.switchingCamera = true;
    elements.switchCameraButton.disabled = true;
    const previousMode = state.facingMode;
    const nextMode = previousMode === "user" ? "environment" : "user";
    const switched = await requestCamera(nextMode, false);
    if (!switched) {
      await requestCamera(previousMode, true);
      elements.cameraStatus.textContent = "この端末ではカメラを切り替えられませんでした。";
    } else if (state.facingMode !== nextMode) {
      elements.cameraStatus.textContent = "この端末では別のカメラを見つけられませんでした。";
    }
    state.switchingCamera = false;
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("画像を読み込めませんでした"));
      image.src = source;
    });
  }

  async function ensureFrameLoaded() {
    const frame = selectedFrame();
    if (!frame) throw new Error("フレームを選んでください");
    if (state.frameImage && state.frameImage.complete && state.frameImagePath === frame.path) return state.frameImage;
    if (state.frameLoadPromise && state.frameImagePath === frame.path) return state.frameLoadPromise;
    state.frameImagePath = frame.path;
    state.frameLoadPromise = loadImage(frame.path).then((image) => {
      if (state.frameImagePath === frame.path) state.frameImage = image;
      return image;
    }).catch((error) => {
      if (state.frameImagePath === frame.path) {
        state.frameImage = null;
        state.frameImagePath = "";
        state.frameLoadPromise = null;
      }
      throw error;
    });
    return state.frameLoadPromise;
  }

  function drawPhotoClipPath(context) {
    const photo = PHOTO_WINDOW;
    const { width, height, radiusX: rx, radiusY: ry } = photo;
    context.beginPath();
    context.moveTo(rx, 0);
    context.lineTo(width - rx, 0);
    context.ellipse(width - rx, ry, rx, ry, 0, -Math.PI / 2, 0, false);
    context.lineTo(width, height);
    context.lineTo(0, height);
    context.lineTo(0, ry);
    context.ellipse(rx, ry, rx, ry, 0, Math.PI, 1.5 * Math.PI, false);
    context.closePath();
  }

  function drawCoverInPhotoWindow(context, source, sourceWidth, sourceHeight, mirror = false) {
    const photo = PHOTO_WINDOW;
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = photo.width / photo.height;
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;
    let cropX = 0;
    let cropY = 0;
    if (sourceRatio > targetRatio) {
      cropWidth = sourceHeight * targetRatio;
      cropX = (sourceWidth - cropWidth) / 2;
    } else {
      cropHeight = sourceWidth / targetRatio;
      cropY = (sourceHeight - cropHeight) / 2;
    }
    context.save();
    context.translate(photo.x, photo.y);
    drawPhotoClipPath(context);
    context.clip();
    if (mirror) {
      context.translate(photo.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, photo.width, photo.height);
    context.restore();
  }

  function canvasToBlob(type, quality) {
    return new Promise((resolve) => elements.canvas.toBlob(resolve, type, quality));
  }

  function revokeResult() {
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = "";
    state.resultBlob = null;
    state.resultFile = null;
    elements.resultImage.removeAttribute("src");
  }

  function createFilename(extension) {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const stamp = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate()), "-", pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join("");
    return `hospital-festival-photo-${state.selectedFrameId}-${stamp}.${extension}`;
  }

  async function makeResult(source, width, height, mirror) {
    const frame = selectedFrame();
    if (!frame) throw new Error("フレームを選んでください");
    const frameIdAtStart = frame.id;
    const context = elements.canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("写真を作成できませんでした");
    const loadedFrame = await ensureFrameLoaded();
    if (state.selectedFrameId !== frameIdAtStart) throw new Error("フレームが変更されました");
    elements.canvas.width = OUTPUT_WIDTH;
    elements.canvas.height = OUTPUT_HEIGHT;
    context.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    drawCoverInPhotoWindow(context, source, width, height, mirror);
    context.drawImage(loadedFrame, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    let blob = await canvasToBlob("image/jpeg", JPEG_QUALITY);
    let extension = "jpg";
    if (!blob || blob.type !== "image/jpeg") {
      blob = await canvasToBlob("image/png");
      extension = "png";
    }
    if (!blob) throw new Error("写真を作成できませんでした");
    revokeResult();
    const filename = createFilename(extension);
    state.resultBlob = blob;
    state.resultExtension = extension;
    state.resultUrl = URL.createObjectURL(blob);
    state.resultFile = new File([blob], filename, { type: blob.type, lastModified: Date.now() });
    elements.resultImage.src = state.resultUrl;
    elements.resultImage.alt = `${frame.label}のフレームを合成した記念写真`;
    elements.resultStatus.textContent = `${frame.label}の写真ができました。保存できたか保護者の方と確認してください。`;
    elements.iosSaveHint.hidden = true;
    showView(elements.resultView);
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  async function runCountdown() {
    state.countingDown = true;
    elements.captureButton.disabled = true;
    elements.switchCameraButton.disabled = true;
    for (const count of [3, 2, 1]) {
      if (!state.stream) throw new Error("Camera stopped");
      elements.countdownOverlay.textContent = String(count);
      elements.countdownOverlay.hidden = false;
      elements.cameraStatus.textContent = `${count}秒後に撮影します…`;
      await wait(1000);
    }
    elements.countdownOverlay.textContent = "★";
    await wait(180);
    elements.countdownOverlay.hidden = true;
  }

  async function capturePhoto() {
    if (state.countingDown || !state.stream || !elements.cameraVideo.videoWidth) return;
    try {
      await runCountdown();
      if (!state.stream || !elements.cameraVideo.videoWidth) throw new Error("Camera stopped");
    } catch (_error) {
      state.countingDown = false;
      elements.countdownOverlay.hidden = true;
      elements.captureButton.disabled = !state.stream;
      elements.switchCameraButton.disabled = !state.stream;
      return;
    }
    elements.cameraStatus.textContent = "写真を作っています…";
    try {
      await makeResult(elements.cameraVideo, elements.cameraVideo.videoWidth, elements.cameraVideo.videoHeight, state.facingMode === "user");
      stopCamera();
    } catch (_error) {
      elements.cameraStatus.textContent = "写真を作れませんでした。もう一度ためしてください。";
      elements.captureButton.disabled = false;
      elements.switchCameraButton.disabled = false;
    } finally {
      state.countingDown = false;
      elements.countdownOverlay.hidden = true;
    }
  }

  async function decodeSelectedImage(file) {
    if ("createImageBitmap" in window) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
      } catch (_error) {
        // Safariなど未対応の端末ではImage要素へフォールバックする。
      }
    }
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(objectUrl);
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, cleanup: () => URL.revokeObjectURL(objectUrl) };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  async function handlePhotoSelection(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!selectedFrame()) {
      showView(elements.startView);
      return;
    }
    if (!file.type.startsWith("image/")) {
      window.alert("写真ファイルを選んでください。");
      return;
    }
    stopCamera();
    const previousView = state.currentView;
    elements.resultStatus.textContent = "写真を作っています…";
    let decoded;
    try {
      decoded = await decodeSelectedImage(file);
      await makeResult(decoded.source, decoded.width, decoded.height, false);
    } catch (_error) {
      if (previousView === elements.cameraView) {
        showView(elements.cameraView);
        elements.cameraStatus.textContent = "写真を読み込めませんでした。カメラをもう一度ためしてください。";
        elements.retryCameraButton.hidden = false;
      } else {
        showView(elements.startView);
      }
      window.alert("この写真を読み込めませんでした。別の写真を選んでください。");
    } finally {
      if (decoded) decoded.cleanup();
    }
  }

  function saveResult() {
    if (!state.resultBlob || !state.resultUrl || !state.resultFile) return;
    const anchor = document.createElement("a");
    anchor.href = state.resultUrl;
    anchor.download = state.resultFile.name;
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    elements.resultStatus.textContent = "保存を開始しました。写真アプリやダウンロード先を確認してください。";
    if (isIos()) elements.iosSaveHint.hidden = false;
  }

  async function retake() {
    revokeResult();
    showView(elements.cameraView);
    await requestCamera(state.facingMode, true);
  }

  function resetToStart() {
    stopCamera();
    revokeResult();
    resetCameraMessages();
    state.facingMode = "environment";
    elements.cameraStage.classList.remove("is-front");
    elements.resultStatus.textContent = "";
    elements.iosSaveHint.hidden = true;
    showView(elements.startView);
  }

  function finish() {
    stopCamera();
    revokeResult();
    showView(elements.doneView);
  }

  function bindEvents() {
    elements.frameOptions.forEach((button) => button.addEventListener("click", () => setSelectedFrame(button.dataset.frameId)));
    elements.startCameraButton.addEventListener("click", startCamera);
    elements.retryCameraButton.addEventListener("click", () => requestCamera(state.facingMode, true));
    elements.switchCameraButton.addEventListener("click", switchCamera);
    elements.captureButton.addEventListener("click", capturePhoto);
    elements.choosePhotoButtons.forEach((button) => button.addEventListener("click", () => { if (selectedFrame()) elements.photoInput.click(); }));
    elements.photoInput.addEventListener("change", handlePhotoSelection);
    elements.saveButton.addEventListener("click", saveResult);
    elements.retakeButton.addEventListener("click", retake);
    elements.finishButton.addEventListener("click", finish);
    elements.restartButton.addEventListener("click", resetToStart);
    elements.backToStartButton.addEventListener("click", resetToStart);
    window.addEventListener("pagehide", () => { stopCamera(); revokeResult(); });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopCamera();
      else if (state.currentView === elements.cameraView && !state.stream) {
        elements.cameraStatus.textContent = "カメラは止まっています。「もう一度ためす」を押してください。";
        elements.retryCameraButton.hidden = false;
      }
    });
  }

  function init() {
    elements.browserHint.hidden = !isLikelyInAppBrowser();
    bindEvents();
  }

  init();
})();
