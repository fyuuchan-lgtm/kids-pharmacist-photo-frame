(() => {
  "use strict";

  const OUTPUT_WIDTH = 1080;
  const OUTPUT_HEIGHT = 1920;
  const JPEG_QUALITY = 0.92;
  const FRAME_PATH = "assets/frame-certificate-1a.png";
  const PHOTO_WINDOW = Object.freeze({ x: 124, y: 518, width: 832, height: 1018 });

  const elements = {
    browserHint: document.querySelector("#browserHint"),
    views: [...document.querySelectorAll(".view")],
    startView: document.querySelector("#startView"),
    cameraView: document.querySelector("#cameraView"),
    resultView: document.querySelector("#resultView"),
    doneView: document.querySelector("#doneView"),
    startCameraButton: document.querySelector("#startCameraButton"),
    backToStartButton: document.querySelector("#backToStartButton"),
    retryCameraButton: document.querySelector("#retryCameraButton"),
    switchCameraButton: document.querySelector("#switchCameraButton"),
    captureButton: document.querySelector("#captureButton"),
    choosePhotoButtons: [...document.querySelectorAll(".js-choose-photo")],
    photoInput: document.querySelector("#photoInput"),
    cameraStage: document.querySelector("#cameraStage"),
    cameraVideo: document.querySelector("#cameraVideo"),
    cameraStatus: document.querySelector("#cameraStatus"),
    cameraError: document.querySelector("#cameraError"),
    cameraErrorMessage: document.querySelector("#cameraErrorMessage"),
    countdownOverlay: document.querySelector("#countdownOverlay"),
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
    facingMode: "user",
    frameImage: null,
    resultBlob: null,
    resultUrl: "",
    resultFile: null,
    resultExtension: "jpg",
    currentView: elements.startView,
    switchingCamera: false,
    countingDown: false
  };

  function showView(view) {
    elements.views.forEach((item) => {
      item.hidden = item !== view;
    });
    state.currentView = view;
    const heading = view.querySelector("h2");
    if (heading) heading.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function isLikelyInAppBrowser() {
    const ua = navigator.userAgent || "";
    return /(Line\/|FBAN|FBAV|Instagram|Twitter|MicroMessenger|TikTok|wv\))/i.test(ua);
  }

  function isIos() {
    return /iP(ad|hone|od)/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
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

    if (!window.isSecureContext) {
      return "カメラを使うには、SafariまたはChromeでHTTPSのページを開いてください。写真から選ぶ方法も使えます。";
    }
    if (denied) {
      return "カメラの許可がオフになっています。ブラウザの設定で許可するか、写真から選んでください。";
    }
    if (unavailable) {
      return "使えるカメラが見つかりませんでした。写真から選んでください。";
    }
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
      const reportedMode = videoTrack && typeof videoTrack.getSettings === "function"
        ? videoTrack.getSettings().facingMode
        : "";
      state.facingMode = reportedMode === "user"
        ? "user"
        : reportedMode
          ? "environment"
          : mode;
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
      if (!allowFallback && error && error.name === "OverconstrainedError") {
        return requestCamera(mode, true);
      }
      showCameraError(error);
      return false;
    }
  }

  function waitForVideoDimensions() {
    if (elements.cameraVideo.videoWidth > 0 && elements.cameraVideo.videoHeight > 0) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("Camera timed out"));
      }, 8000);
      const onReady = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        window.clearTimeout(timer);
        elements.cameraVideo.removeEventListener("loadedmetadata", onReady);
      };
      elements.cameraVideo.addEventListener("loadedmetadata", onReady, { once: true });
    });
  }

  async function startCamera() {
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
    if (state.frameImage && state.frameImage.complete) return state.frameImage;
    state.frameImage = await loadImage(FRAME_PATH);
    return state.frameImage;
  }

  function drawCoverInPhotoWindow(context, source, sourceWidth, sourceHeight, mirror = false) {
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = PHOTO_WINDOW.width / PHOTO_WINDOW.height;
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
    context.translate(PHOTO_WINDOW.x, PHOTO_WINDOW.y);
    context.beginPath();
    context.rect(0, 0, PHOTO_WINDOW.width, PHOTO_WINDOW.height);
    context.clip();
    if (mirror) {
      context.translate(PHOTO_WINDOW.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(
      source,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      PHOTO_WINDOW.width,
      PHOTO_WINDOW.height
    );
    context.restore();
  }

  function canvasToBlob(type, quality) {
    return new Promise((resolve) => {
      elements.canvas.toBlob(resolve, type, quality);
    });
  }

  function revokeResult() {
    if (state.resultUrl) {
      URL.revokeObjectURL(state.resultUrl);
      state.resultUrl = "";
    }
    state.resultBlob = null;
    state.resultFile = null;
    elements.resultImage.removeAttribute("src");
  }

  function createFilename(extension) {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const stamp = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      "-",
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds())
    ].join("");
    return `hospital-festival-photo-${stamp}.${extension}`;
  }

  async function makeResult(source, width, height, mirror) {
    const context = elements.canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("写真を作成できませんでした");

    const frame = await ensureFrameLoaded();
    context.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    context.drawImage(frame, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    drawCoverInPhotoWindow(context, source, width, height, mirror);

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
    elements.resultStatus.textContent = "写真ができました。保存できたか保護者の方と確認してください。";
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
      await makeResult(
        elements.cameraVideo,
        elements.cameraVideo.videoWidth,
        elements.cameraVideo.videoHeight,
        state.facingMode === "user"
      );
      stopCamera();
    } catch (error) {
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
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: () => bitmap.close()
        };
      } catch (_error) {
        // Safariなど未対応の端末ではImage要素へフォールバックする。
      }
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(objectUrl);
      return {
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        cleanup: () => URL.revokeObjectURL(objectUrl)
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  async function handlePhotoSelection(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
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
      showView(previousView === elements.resultView ? elements.startView : previousView);
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
    state.facingMode = "user";
    elements.cameraStage.classList.add("is-front");
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
    elements.startCameraButton.addEventListener("click", startCamera);
    elements.retryCameraButton.addEventListener("click", () => requestCamera(state.facingMode, true));
    elements.switchCameraButton.addEventListener("click", switchCamera);
    elements.captureButton.addEventListener("click", capturePhoto);
    elements.choosePhotoButtons.forEach((button) => {
      button.addEventListener("click", () => elements.photoInput.click());
    });
    elements.photoInput.addEventListener("change", handlePhotoSelection);
    elements.saveButton.addEventListener("click", saveResult);
    elements.retakeButton.addEventListener("click", retake);
    elements.finishButton.addEventListener("click", finish);
    elements.restartButton.addEventListener("click", resetToStart);
    elements.backToStartButton.addEventListener("click", resetToStart);

    window.addEventListener("pagehide", () => {
      stopCamera();
      revokeResult();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopCamera();
      } else if (state.currentView === elements.cameraView && !state.stream) {
        elements.cameraStatus.textContent = "カメラは止まっています。「もう一度ためす」を押してください。";
        elements.retryCameraButton.hidden = false;
      }
    });
  }

  function init() {
    elements.browserHint.hidden = !isLikelyInAppBrowser();
    elements.cameraStage.classList.add("is-front");
    bindEvents();
    ensureFrameLoaded().catch(() => {
      elements.startCameraButton.disabled = true;
      elements.startCameraButton.textContent = "フレームを読み込めませんでした";
      elements.choosePhotoButtons.forEach((button) => { button.disabled = true; });
    });
  }

  init();
})();
