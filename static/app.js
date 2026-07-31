/* ---------- Local video storage (IndexedDB) ----------
   Recorded video never leaves the browser — stored here so past takes can be replayed
   from the Progress page, keyed to the same entry as its metrics/scores. localStorage
   can't hold blobs of this size; IndexedDB is built for exactly this. */
const VIDEO_DB_NAME = "speakwell_videos";
const VIDEO_STORE = "recordings";
const MAX_STORED_VIDEOS = 15;

function openVideoDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VIDEO_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(VIDEO_STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveVideoBlob(id, blob) {
  if (!blob) return;
  try {
    const db = await openVideoDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(VIDEO_STORE, "readwrite");
      tx.objectStore(VIDEO_STORE).put({ id, blob, savedAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await pruneOldVideos(db);
    console.log("[SpeakWell recording diag] saved video to IndexedDB", { id, size: blob.size });
  } catch (e) {
    console.warn("[SpeakWell recording diag] video save FAILED:", e);
  }
}

async function pruneOldVideos(db) {
  const store = db.transaction(VIDEO_STORE, "readwrite").objectStore(VIDEO_STORE);
  const all = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (all.length > MAX_STORED_VIDEOS) {
    all.sort((a, b) => a.savedAt - b.savedAt);
    const delStore = db.transaction(VIDEO_STORE, "readwrite").objectStore(VIDEO_STORE);
    all.slice(0, all.length - MAX_STORED_VIDEOS).forEach((v) => delStore.delete(v.id));
  }
}

async function getVideoBlob(id) {
  if (!id) return null;
  try {
    const db = await openVideoDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(VIDEO_STORE, "readonly").objectStore(VIDEO_STORE).get(id);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("Couldn't load saved recording:", e);
    return null;
  }
}

/* ---------- Tab switching ---------- */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "history") renderHistory();
  });
});

/* ---------- Lessons ---------- */
const LESSONS = [
  {
    id: "structure",
    title: "🧱 Structure your talk",
    tips: [
      "Open with a hook: a question, a surprising fact, or a short story.",
      "Use the PREP method for any point: Point → Reason → Example → Point (restate).",
      "Close by restating your key message and a clear call to action.",
    ],
    tryIt: "Try it: write a one-sentence hook for a topic you know well.",
  },
  {
    id: "pace",
    title: "⏱️ Pace & pauses",
    tips: [
      "Aim for 120–150 words per minute — fast enough to hold attention, slow enough to follow.",
      "Use a silent pause (1–2 sec) after key points instead of filling space with sound.",
      "Breathe deliberately between sentences; it naturally slows you down.",
    ],
    tryIt: "Try it: say one sentence, then count '1-2' silently before continuing.",
  },
  {
    id: "filler",
    title: "🚫 Cut the filler words",
    tips: [
      "Common culprits: um, uh, like, you know, sort of, basically, actually.",
      "Replace the urge to fill silence with a pause — audiences barely notice pauses.",
      "Record yourself for 30 seconds and count fillers; awareness alone cuts them fast.",
    ],
    tryIt: "Try it: describe your morning for 30 seconds without saying 'um' or 'like'.",
  },
  {
    id: "body",
    title: "🙆 Body language & eye contact",
    tips: [
      "Look at the camera (or audience) roughly 60–80% of the time — not a constant stare.",
      "Keep an open posture: shoulders back, hands visible, avoid crossing arms.",
      "Use purposeful gestures tied to your words; avoid pacing or fidgeting.",
    ],
    tryIt: "Try it: record 20 seconds looking directly at the camera lens, not the screen.",
  },
  {
    id: "nerves",
    title: "😌 Manage nerves",
    tips: [
      "Rehearse out loud (not just in your head) at least 3 times before it matters.",
      "Box breathing before you start: inhale 4s, hold 4s, exhale 4s, hold 4s.",
      "Reframe adrenaline as excitement — it's the same physiological response.",
    ],
    tryIt: "Try it: do one round of box breathing right now, then record a 30-second intro.",
  },
];

function renderLessons() {
  const done = JSON.parse(localStorage.getItem("speakwell_lessons_done") || "{}");
  const grid = document.getElementById("lesson-list");
  grid.innerHTML = LESSONS.map(
    (l) => `
    <div class="lesson-card">
      <h3>${l.title}</h3>
      <ul>${l.tips.map((t) => `<li>${t}</li>`).join("")}</ul>
      <div class="try-it">${l.tryIt}</div>
      <label><input type="checkbox" data-lesson="${l.id}" ${done[l.id] ? "checked" : ""}/> Mark as learned</label>
    </div>`
  ).join("");

  grid.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const d = JSON.parse(localStorage.getItem("speakwell_lessons_done") || "{}");
      d[cb.dataset.lesson] = cb.checked;
      localStorage.setItem("speakwell_lessons_done", JSON.stringify(d));
    });
  });
}
renderLessons();

/* ---------- Practice topics ---------- */
const TOPICS = [
  { id: "intro", title: "Self-introduction", desc: "Introduce yourself in under 60 seconds: who you are, what you do, one interesting fact." },
  { id: "pitch", title: "Elevator pitch", desc: "Pitch a product or idea you care about in 60–90 seconds, as if to an investor." },
  { id: "explain", title: "Explain a concept", desc: "Explain a topic you know well to someone with zero background, in about 90 seconds." },
  { id: "persuade", title: "Persuade", desc: "Convince a friend to try something new (a hobby, food, habit) in under 2 minutes." },
  { id: "story", title: "Tell a story", desc: "Tell a short personal story with a clear beginning, middle, and end." },
  { id: "qa", title: "Handle a tough question", desc: "State an opinion on a topic, then answer an imaginary tough follow-up question about it." },
  { id: "freestyle", title: "Freestyle", desc: "Talk about anything for 1–2 minutes. Just practice speaking clearly and confidently." },
];

const topicSelect = document.getElementById("topicSelect");
topicSelect.innerHTML = TOPICS.map((t) => `<option value="${t.id}">${t.title}</option>`).join("");
function renderPrompt() {
  const t = TOPICS.find((t) => t.id === topicSelect.value) || TOPICS[0];
  document.getElementById("promptCard").textContent = t.desc;
}
topicSelect.addEventListener("change", renderPrompt);
renderPrompt();

/* ---------- Camera / recording state ---------- */
const liveVideo = document.getElementById("liveVideo");
const playbackVideo = document.getElementById("playbackVideo");
const overlay = document.getElementById("overlay");
const enableCamBtn = document.getElementById("enableCamBtn");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const retryBtn = document.getElementById("retryBtn");
const camStatus = document.getElementById("camStatus");
const recBadge = document.getElementById("recBadge");
const recTimer = document.getElementById("recTimer");
const liveMetrics = document.getElementById("liveMetrics");
const liveWpmEl = document.getElementById("liveWpm");
const liveFillersEl = document.getElementById("liveFillers");
const liveEyeEl = document.getElementById("liveEye");
const liveExpressionEl = document.getElementById("liveExpression");
const liveVolumeEl = document.getElementById("liveVolume");
const transcriptBox = document.getElementById("transcriptBox");
const transcriptText = document.getElementById("transcriptText");
const appraisalArea = document.getElementById("appraisalArea");

let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let faceModelReady = false;
let expressionModelReady = false;
let landmarkModelReady = false;
let faceLoopHandle = null;
let recognizer = null;
let audioCtx = null;
let analyser = null;
let micNoiseFloorDb = null;

let recState = {
  recording: false,
  startTime: 0,
  timerHandle: null,
  finalTranscript: "",
  fillerCount: 0,
  lastResultTime: 0,
  pauseCount: 0,
  faceSamples: 0,
  faceCentered: 0,
  faceAvailable: false,
  expressionSamples: 0,
  happySum: 0,
  neutralSum: 0,
  dominantCounts: {},
  volumeSamples: [],
  pitchSamples: [],
  audioSampleHandle: null,
};

const FILLER_RE = /\b(um+|uh+|erm+|hm+|like|you know|sort of|kind of|basically|literally|actually)\b/gi;
const PAUSE_THRESHOLD_MS = 3000;

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function stddev(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}
function percentile(sortedArr, p) {
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.floor(p * (sortedArr.length - 1))));
  return sortedArr[idx];
}

enableCamBtn.addEventListener("click", enableCamera);
startBtn.addEventListener("click", startRecording);
stopBtn.addEventListener("click", stopRecording);
retryBtn.addEventListener("click", resetForRetry);

async function enableCamera() {
  try {
    // Browsers auto-normalize mic loudness by default (autoGainControl), which actively
    // works against measuring real volume variation — it's designed to flatten exactly
    // what we're trying to detect. Ask for raw, unprocessed audio instead.
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: { autoGainControl: false, noiseSuppression: false, echoCancellation: false },
    });
    liveVideo.srcObject = mediaStream;
    enableCamBtn.disabled = true;
    startBtn.disabled = false;
    camStatus.textContent = "Camera ready. Pick a prompt, then hit Start Recording.";
    loadFaceModel();
    setupAudioAnalysis();
    await calibrateMicNoiseFloor();
  } catch (err) {
    camStatus.textContent = "Couldn't access camera/mic: " + err.message;
  }
}

function setupAudioAnalysis() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(mediaStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048; // longer window = more periods per frame = more reliable low-pitch autocorrelation
    source.connect(analyser);
  } catch (err) {
    analyser = null;
    console.warn("Web Audio analysis unavailable; tone/volume tracking disabled.", err);
  }
}

// Absolute dB thresholds don't generalize across devices — a quiet laptop mic and a
// loud external one can differ by 20-30dB for the exact same speaking volume. Instead,
// measure this user's own ambient room/mic noise floor right after they enable the
// camera, and score everything else (voice detection, energy) relative to that baseline.
async function calibrateMicNoiseFloor() {
  if (!analyser) {
    micNoiseFloorDb = -50;
    return;
  }
  const prevStatus = camStatus.textContent;
  camStatus.textContent = "Calibrating microphone — stay quiet for a second...";
  const buf = new Float32Array(analyser.fftSize);
  const samples = [];
  const start = Date.now();
  while (Date.now() - start < 700) {
    analyser.getFloatTimeDomainData(buf);
    let sumSquares = 0;
    for (let i = 0; i < buf.length; i++) sumSquares += buf[i] * buf[i];
    const rms = Math.sqrt(sumSquares / buf.length);
    samples.push(20 * Math.log10(Math.max(rms, 1e-6)));
    await new Promise((r) => setTimeout(r, 50));
  }
  samples.sort((a, b) => a - b);
  micNoiseFloorDb = percentile(samples, 0.5);
  camStatus.textContent = prevStatus;
}

// Autocorrelation-based pitch (fundamental frequency) detector.
// Returns Hz, or -1 if the buffer is too quiet / no clear periodicity found.
function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  let r1 = 0, r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) { if (Math.abs(buf[i]) < thres) { r1 = i; break; } }
  for (let i = 1; i < SIZE / 2; i++) { if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; } }
  const trimmed = buf.slice(r1, r2);
  const n = trimmed.length;
  if (n < 8) return -1;

  // Prefix sum of squares, used below to normalize the correlation at each lag by
  // the actual energy present at that lag (plain unnormalized autocorrelation decays
  // toward longer lags purely because fewer samples overlap — nothing to do with
  // periodicity — so without this a clean tone's own true pitch lag looks "unclear").
  const prefixSq = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) prefixSq[i + 1] = prefixSq[i] + trimmed[i] * trimmed[i];

  const c = new Float32Array(n);
  const nsdf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n - i; j++) sum += trimmed[j] * trimmed[j + i];
    c[i] = sum;
    const energy = prefixSq[n - i] + (prefixSq[n] - prefixSq[i]);
    nsdf[i] = energy > 0 ? (2 * sum) / energy : 0;
  }

  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;
  let maxVal = -1, maxPos = -1;
  for (let i = d; i < n; i++) {
    if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
  }
  if (maxPos <= 0) return -1;

  // Clarity: normalized similarity (McLeod Pitch Method's NSDF) at the detected lag,
  // ~1.0 for a clean periodic tone regardless of lag, ~0 for noise. Low clarity means
  // a noisy/breathy/ambiguous frame where the "pitch" is unreliable — reject it rather
  // than emit a guess, since a wrong guess is exactly what inflates tone-variation
  // scores on frames that aren't clearly voiced.
  const clarity = nsdf[maxPos];
  if (clarity < 0.9) return -1;

  let T0 = maxPos;
  const x1 = c[T0 - 1] ?? c[T0], x2 = c[T0], x3 = c[T0 + 1] ?? c[T0];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  return T0 > 0 ? sampleRate / T0 : -1;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms — likely hung, not a normal failure`)), ms)),
  ]);
}

async function loadFaceModel() {
  console.log("[SpeakWell face-detect diag] loadFaceModel() entered, typeof faceapi:", typeof faceapi);
  // npm's published face-api.js package ships no model weights; the GitHub-hosted
  // copy via jsdelivr's /gh/ endpoint is the one that actually resolves.
  const MODEL_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights";
  try {
    console.log("[SpeakWell face-detect diag] starting tinyFaceDetector load...");
    await withTimeout(faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL), 8000, "tinyFaceDetector");
    console.log("[SpeakWell face-detect diag] tinyFaceDetector loaded OK");
    faceModelReady = true;
    camStatus.textContent = "Camera ready. Pick a prompt, then hit Start Recording.";
  } catch (err) {
    faceModelReady = false;
    camStatus.textContent = "Camera ready, but face tracking failed to load (eye contact/expression won't be measured).";
    console.warn("[SpeakWell face-detect diag] tinyFaceDetector FAILED to load:", err);
    runFaceLoop();
    return;
  }
  try {
    console.log("[SpeakWell face-detect diag] starting faceExpressionNet load...");
    await withTimeout(faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL), 8000, "faceExpressionNet");
    console.log("[SpeakWell face-detect diag] faceExpressionNet loaded OK");
    expressionModelReady = true;
  } catch (err) {
    expressionModelReady = false;
    console.warn("[SpeakWell face-detect diag] faceExpressionNet FAILED to load:", err);
  }
  try {
    console.log("[SpeakWell face-detect diag] starting faceLandmark68TinyNet load...");
    await withTimeout(faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL), 8000, "faceLandmark68TinyNet");
    console.log("[SpeakWell face-detect diag] faceLandmark68TinyNet loaded OK");
    landmarkModelReady = true;
  } catch (err) {
    landmarkModelReady = false;
    console.warn("[SpeakWell face-detect diag] faceLandmark68TinyNet FAILED to load:", err);
  }
  console.log("[SpeakWell face-detect diag] calling runFaceLoop()");
  runFaceLoop();
}

// A centered face bounding box only tells you the person is sitting in front of the
// camera — not that they're actually looking at it (you can be centered while looking
// down at notes or off to the side). This estimates head yaw/pitch from landmark
// geometry as a much closer proxy for "looking at the lens": nose position relative to
// the eye line should sit close to the midpoint (yaw) and land in a normal band between
// the eyes and chin (pitch) when facing forward.
function estimateGazeAtCamera(landmarks) {
  const avg = (pts) => ({
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  });
  const leftEye = avg(landmarks.getLeftEye());
  const rightEye = avg(landmarks.getRightEye());
  const noseTip = landmarks.getNose()[3]; // point 30 in the 68-point scheme: the nose tip
  const chin = landmarks.getJawOutline()[8]; // bottom-center of the jaw

  const midEyeX = (leftEye.x + rightEye.x) / 2;
  const eyeSpan = Math.abs(rightEye.x - leftEye.x);
  if (eyeSpan < 1) return null;
  const yawRatio = (noseTip.x - midEyeX) / eyeSpan;

  const eyeLineY = (leftEye.y + rightEye.y) / 2;
  const faceHeight = Math.abs(chin.y - eyeLineY);
  if (faceHeight < 1) return null;
  const pitchRatio = (noseTip.y - eyeLineY) / faceHeight;

  return Math.abs(yawRatio) < 0.18 && pitchRatio > 0.28 && pitchRatio < 0.68;
}

function runFaceLoop() {
  console.log("[SpeakWell face-detect diag] runFaceLoop() started, faceModelReady:", faceModelReady);
  const w = liveVideo.clientWidth, h = liveVideo.clientHeight;
  overlay.width = w;
  overlay.height = h;
  const ctx = overlay.getContext("2d");

  let lastDiagLog = 0;
  let loggedFirstTick = false;
  async function tick() {
    if (!loggedFirstTick) {
      loggedFirstTick = true;
      console.log("[SpeakWell face-detect diag] tick loop is running, faceModelReady:", faceModelReady, "liveVideo display:", liveVideo.style.display);
    }
    if (!faceModelReady || liveVideo.style.display === "none") {
      faceLoopHandle = requestAnimationFrame(tick);
      return;
    }
    try {
      // Base face box first, on its own short timeout — this alone is enough for eye
      // contact + drawing the box. Landmarks/expressions are fetched separately below
      // so that a hang in either of those (observed on some browsers) can't also take
      // down the basic detection that doesn't depend on them.
      const baseDet = await withTimeout(
        faceapi.detectSingleFace(liveVideo, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 })),
        2500,
        "baseDetect"
      );

      let det = baseDet;
      if (baseDet && (landmarkModelReady || expressionModelReady)) {
        try {
          let fullQuery = faceapi.detectSingleFace(liveVideo, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }));
          if (landmarkModelReady) fullQuery = fullQuery.withFaceLandmarks(true);
          if (expressionModelReady) fullQuery = fullQuery.withFaceExpressions();
          det = await withTimeout(fullQuery, 2500, "fullDetect");
        } catch (fullErr) {
          if (Date.now() - lastDiagLog > 2000) {
            console.warn("[SpeakWell face-detect diag] landmarks/expressions failed or timed out, using box-only:", fullErr);
          }
          det = baseDet; // still have a usable box even if this part failed
        }
      }

      // Throttled diagnostic: face detection has been silently failing for some users
      // on some devices with no visible error, so surface enough to actually see why.
      if (Date.now() - lastDiagLog > 2000) {
        lastDiagLog = Date.now();
        console.log("[SpeakWell face-detect diag]", {
          tfBackend: (typeof faceapi !== "undefined" && faceapi.tf) ? faceapi.tf.getBackend() : "unknown",
          videoWidth: liveVideo.videoWidth,
          videoHeight: liveVideo.videoHeight,
          videoReadyState: liveVideo.readyState,
          faceFound: !!det,
          hasLandmarks: !!(det && det.landmarks),
          hasExpressions: !!(det && det.expressions),
          detectionScore: det ? (det.detection ? det.detection.score : det.score) : null,
        });
      }

      ctx.clearRect(0, 0, overlay.width, overlay.height);
      let centered = false;
      if (det) {
        const box = det.detection ? det.detection.box : det.box;
        const scaleX = overlay.width / liveVideo.videoWidth;
        const scaleY = overlay.height / liveVideo.videoHeight;
        ctx.strokeStyle = "#4fd1c5";
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x * scaleX, box.y * scaleY, box.width * scaleX, box.height * scaleY);

        const cx = (box.x + box.width / 2) / liveVideo.videoWidth;
        const cy = (box.y + box.height / 2) / liveVideo.videoHeight;
        const boxCentered = cx > 0.25 && cx < 0.75 && cy > 0.15 && cy < 0.85 && box.width / liveVideo.videoWidth > 0.12;

        // Being centered in frame just means "present" — require the head-pose
        // estimate to also say they're actually facing the lens, when available.
        const gazeAtCamera = det.landmarks ? estimateGazeAtCamera(det.landmarks) : null;
        centered = boxCentered && (gazeAtCamera === null ? true : gazeAtCamera);
      }
      if (recState.recording) {
        recState.faceAvailable = true;
        recState.faceSamples++;
        if (centered) recState.faceCentered++;
        const pct = recState.faceSamples ? Math.round((100 * recState.faceCentered) / recState.faceSamples) : 0;
        liveEyeEl.textContent = pct + "%";

        if (det && det.expressions) {
          recState.expressionSamples++;
          recState.happySum += det.expressions.happy;
          recState.neutralSum += det.expressions.neutral;
          const dominant = Object.entries(det.expressions).sort((a, b) => b[1] - a[1])[0][0];
          recState.dominantCounts[dominant] = (recState.dominantCounts[dominant] || 0) + 1;
          liveExpressionEl.textContent = dominant;
        }
      }
    } catch (e) {
      if (Date.now() - lastDiagLog > 2000) {
        lastDiagLog = Date.now();
        console.warn("[SpeakWell face-detect diag] detection threw:", e);
      }
    }
    faceLoopHandle = requestAnimationFrame(tick);
  }
  tick();
}

function startRecording() {
  recordedChunks = [];
  recState = {
    recording: true,
    startTime: Date.now(),
    timerHandle: null,
    finalTranscript: "",
    fillerCount: 0,
    lastResultTime: Date.now(),
    pauseCount: 0,
    faceSamples: 0,
    faceCentered: 0,
    faceAvailable: false,
    expressionSamples: 0,
    happySum: 0,
    neutralSum: 0,
    dominantCounts: {},
    volumeSamples: [],
    pitchSamples: [],
    audioSampleHandle: null,
    videoBlob: null,
  };
  transcriptText.textContent = "";
  transcriptBox.style.display = "block";
  liveMetrics.style.display = "grid";
  liveWpmEl.textContent = "0";
  liveFillersEl.textContent = "0";
  liveEyeEl.textContent = "0%";
  liveExpressionEl.textContent = "—";
  liveVolumeEl.textContent = "—";
  appraisalArea.innerHTML = "";

  // Safari doesn't support webm at all — MediaRecorder silently falls back to its own
  // default (mp4) when none of these match, which is exactly what we want here; the
  // actual negotiated type is read back from mediaRecorder.mimeType after construction
  // rather than assumed, since hardcoding "video/webm" on the resulting Blob would
  // mislabel real mp4 bytes and break playback.
  const mimeCandidates = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m));
  mediaRecorder = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined);
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.start();

  startSpeechRecognition();

  recState.timerHandle = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recState.startTime) / 1000);
    const mm = Math.floor(elapsed / 60), ss = elapsed % 60;
    recTimer.textContent = `${mm}:${ss.toString().padStart(2, "0")}`;
    const words = recState.finalTranscript.trim() ? recState.finalTranscript.trim().split(/\s+/).length : 0;
    const wpm = elapsed > 0 ? Math.round(words / (elapsed / 60)) : 0;
    liveWpmEl.textContent = wpm;
  }, 500);

  // How many dB above this user's own calibrated ambient noise floor counts as
  // "speaking" — device-relative, not a fixed absolute level (mic gain varies by
  // 20-30dB across devices for the same real speaking volume).
  const VOICE_MARGIN_DB = 10;
  const noiseFloor = micNoiseFloorDb === null ? -50 : micNoiseFloorDb;
  if (analyser) {
    const buf = new Float32Array(analyser.fftSize);
    recState.audioSampleHandle = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sumSquares = 0;
      for (let i = 0; i < buf.length; i++) sumSquares += buf[i] * buf[i];
      const rms = Math.sqrt(sumSquares / buf.length);
      // dB (full-scale) tracks perceived loudness far better than raw linear amplitude,
      // and — unlike a 0-100 linear scale — never silently clips, which was flattening
      // genuine volume swings into an artificial ceiling for anyone speaking reasonably
      // loud into their mic.
      const dbfs = 20 * Math.log10(Math.max(rms, 1e-6));
      liveVolumeEl.textContent = dbfs > -20 ? "Loud" : dbfs > -34 ? "Good" : "Quiet";

      const isVoiced = dbfs > noiseFloor + VOICE_MARGIN_DB;
      // Only feed variation stats from frames where the speaker is actually talking —
      // otherwise the natural silence between sentences/breaths gets counted as
      // "volume variation", making even flat delivery look dynamic.
      if (!isVoiced) return;
      recState.volumeSamples.push(dbfs);

      const rawPitch = autoCorrelate(buf, audioCtx.sampleRate);
      if (rawPitch <= 70 || rawPitch >= 500) return;
      const recent = recState.pitchSamples.slice(-5);
      if (recent.length >= 3) {
        const sortedRecent = [...recent].sort((a, b) => a - b);
        const recentMedian = sortedRecent[Math.floor(sortedRecent.length / 2)];
        const ratio = rawPitch / recentMedian;
        // Reject likely octave errors (autocorrelation locking onto a harmonic/subharmonic)
        // rather than let them masquerade as genuine pitch variation.
        if (ratio > 1.6 || ratio < 0.63) return;
      }
      recState.pitchSamples.push(rawPitch);
    }, 250);
  }

  recBadge.style.display = "flex";
  startBtn.disabled = true;
  stopBtn.disabled = false;
  topicSelect.disabled = true;
}

function startSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    camStatus.textContent = "Speech recognition isn't supported in this browser (try Chrome) — transcript/pacing metrics will be limited.";
    return;
  }
  recognizer = new SR();
  recognizer.continuous = true;
  recognizer.interimResults = true;
  recognizer.lang = "en-US";

  recognizer.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        const now = Date.now();
        if (recState.finalTranscript && now - recState.lastResultTime > PAUSE_THRESHOLD_MS) {
          recState.pauseCount++;
        }
        recState.lastResultTime = now;
        recState.finalTranscript += chunk + " ";
        const matches = chunk.match(FILLER_RE);
        if (matches) recState.fillerCount += matches.length;
        liveFillersEl.textContent = recState.fillerCount;
      } else {
        interim += chunk;
      }
    }
    transcriptText.textContent = recState.finalTranscript + interim;
    transcriptText.parentElement.scrollTop = transcriptText.parentElement.scrollHeight;
  };
  recognizer.onerror = (e) => console.warn("speech recognition error", e.error);
  recognizer.onend = () => {
    if (recState.recording) {
      try { recognizer.start(); } catch (e) { /* already running */ }
    }
  };
  recognizer.start();
}

function stopRecording() {
  recState.recording = false;
  clearInterval(recState.timerHandle);
  clearInterval(recState.audioSampleHandle);
  recBadge.style.display = "none";
  stopBtn.disabled = true;
  topicSelect.disabled = false;

  if (recognizer) { try { recognizer.stop(); } catch (e) {} }

  mediaRecorder.onstop = () => {
    const actualMime = mediaRecorder.mimeType || "video/webm";
    const blob = new Blob(recordedChunks, { type: actualMime });
    console.log("[SpeakWell recording diag]", {
      chunkCount: recordedChunks.length,
      chunkSizes: recordedChunks.map((c) => c.size),
      totalBlobSize: blob.size,
      mimeType: mediaRecorder.mimeType,
    });
    const url = URL.createObjectURL(blob);
    liveVideo.style.display = "none";
    playbackVideo.style.display = "block";
    playbackVideo.src = url;
    retryBtn.style.display = "inline-block";
    recState.videoBlob = blob;
    showAppraiseButton();
  };
  mediaRecorder.stop();
}

function resetForRetry() {
  liveVideo.style.display = "block";
  playbackVideo.style.display = "none";
  playbackVideo.src = "";
  retryBtn.style.display = "none";
  startBtn.disabled = false;
  transcriptBox.style.display = "none";
  liveMetrics.style.display = "none";
  appraisalArea.innerHTML = "";
  camStatus.textContent = "Ready for another take.";
}

/* ---------- Appraisal ---------- */
function computeMetrics() {
  const durationSec = Math.max(1, Math.round((Date.now() - recState.startTime) / 1000));
  const transcript = recState.finalTranscript.trim();
  const words = transcript ? transcript.split(/\s+/) : [];
  const wordCount = words.length;
  const wpm = Math.round(wordCount / (durationSec / 60));
  const fillerRatePer100 = wordCount ? +(100 * recState.fillerCount / wordCount).toFixed(1) : 0;
  const eyeContactPct = recState.faceAvailable && recState.faceSamples
    ? Math.round((100 * recState.faceCentered) / recState.faceSamples)
    : null;

  const hasExpressions = recState.expressionSamples > 0;
  const smilePct = hasExpressions ? Math.round((100 * recState.happySum) / recState.expressionSamples) : null;
  const neutralCount = recState.dominantCounts.neutral || 0;
  const engagedExpressionPct = hasExpressions
    ? Math.round(100 * (1 - neutralCount / recState.expressionSamples))
    : null;
  const dominantExpression = hasExpressions
    ? Object.entries(recState.dominantCounts).sort((a, b) => b[1] - a[1])[0][0]
    : null;

  // Volume variation: dB range between your loudest and softest voiced moments (10th to
  // 90th percentile, robust to a single stray spike). This directly captures "did you
  // deliberately go from soft to loud" — a stddev-vs-fixed-ideal measure would instead
  // penalize exactly that kind of large, intentional swing as "too erratic".
  // volumeAboveFloorDb (mean loudness relative to this user's own calibrated ambient
  // noise floor) drives the energy score — absolute dBFS isn't comparable across
  // devices, since mic gain alone can differ by 20-30dB for the same real volume.
  let volumeMeanDb = null, volumeVariationDb = null, volumeAboveFloorDb = null;
  if (recState.volumeSamples.length >= 4) {
    const sortedVol = [...recState.volumeSamples].sort((a, b) => a - b);
    volumeMeanDb = Math.round(mean(recState.volumeSamples));
    volumeVariationDb = +(percentile(sortedVol, 0.9) - percentile(sortedVol, 0.1)).toFixed(1);
    const floor = micNoiseFloorDb === null ? -50 : micNoiseFloorDb;
    volumeAboveFloorDb = +(volumeMeanDb - floor).toFixed(1);
  }

  // Tone variation: pitch range in semitones between the 10th/90th percentile
  // (robust to outlier pitch-detector glitches), from clarity-gated voiced samples only.
  // Require more samples than before since confidence gating in autoCorrelate() now
  // throws out a lot of low-quality frames, so what's left is more trustworthy.
  let toneVariationSemitones = null, meanPitchHz = null;
  if (recState.pitchSamples.length >= 12) {
    const sorted = [...recState.pitchSamples].sort((a, b) => a - b);
    const p10 = percentile(sorted, 0.1);
    const p90 = percentile(sorted, 0.9);
    meanPitchHz = Math.round(mean(recState.pitchSamples));
    toneVariationSemitones = p10 > 0 ? +(12 * Math.log2(p90 / p10)).toFixed(1) : null;
  }

  return {
    topic: TOPICS.find((t) => t.id === topicSelect.value)?.title || "Freestyle",
    transcript,
    durationSec,
    wordCount,
    wpm,
    fillerCount: recState.fillerCount,
    fillerRatePer100,
    pauseCount: recState.pauseCount,
    eyeContactPct,
    smilePct,
    engagedExpressionPct,
    dominantExpression,
    volumeMeanDb,
    volumeVariationDb,
    volumeAboveFloorDb,
    toneVariationSemitones,
    meanPitchHz,
  };
}

function showAppraiseButton() {
  const metrics = computeMetrics();
  appraisalArea.innerHTML = `
    <div class="appraisal-card">
      <p>Nice work — ${metrics.wordCount} words in ${metrics.durationSec}s.</p>
      <button id="appraiseBtn" class="btn primary">Get AI Appraisal</button>
    </div>`;
  document.getElementById("appraiseBtn").addEventListener("click", () => requestAppraisal(metrics));
}

async function requestAppraisal(metrics) {
  appraisalArea.innerHTML = `<div class="appraisal-card">Analyzing your presentation…</div>`;
  try {
    const res = await fetch("/api/appraise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metrics),
    });
    const data = await res.json();
    renderAppraisal(data, metrics);
    saveHistory(data, metrics);
  } catch (err) {
    appraisalArea.innerHTML = `<div class="appraisal-card">Appraisal failed: ${err.message}</div>`;
  }
}

function renderAppraisal(data, metrics) {
  const breakdown = data.scoreBreakdown || {};
  const rows = Object.entries(breakdown)
    .map(([k, v]) => `<div><div class="label">${k}</div><div class="val">${v}/100</div></div>`)
    .join("");
  appraisalArea.innerHTML = `
    <div class="appraisal-card">
      <div class="score-row">
        <div class="score-circle">${data.overallScore}</div>
        <div class="score-breakdown">${rows}</div>
      </div>
      <p>${data.summary || ""}</p>
      <div class="appraisal-cols">
        <div>
          <h4>✅ Strengths</h4>
          <ul>${(data.strengths || []).map((s) => `<li>${s}</li>`).join("")}</ul>
        </div>
        <div>
          <h4>🎯 Improve next</h4>
          <ul>${(data.improvements || []).map((s) => `<li>${s}</li>`).join("")}</ul>
        </div>
      </div>
      ${data.tips && data.tips.length ? `<h4>💡 Tips to try</h4><ul>${data.tips.map((t) => `<li>${t}</li>`).join("")}</ul>` : ""}
      <div class="mode-note">${
        data.mode === "ai"
          ? "Feedback generated by Claude."
          : "Offline rule-based feedback (set ANTHROPIC_API_KEY on the server for richer AI feedback)."
      }</div>
    </div>`;
}

const SCORE_LABELS = {
  pacing: "Pacing",
  fillerWords: "Filler words",
  bodyLanguage: "Body language",
  tone: "Tone",
  volume: "Volume",
  energy: "Energy",
};

function saveHistory(data, metrics) {
  const hist = JSON.parse(localStorage.getItem("speakwell_history") || "[]");
  const videoId = recState.videoBlob ? `rec-${Date.now()}-${Math.random().toString(36).slice(2)}` : null;
  hist.unshift({
    date: new Date().toISOString(),
    topic: metrics.topic,
    durationSec: metrics.durationSec,
    wordCount: metrics.wordCount,
    overallScore: data.overallScore,
    scores: data.scoreBreakdown || {},
    wpm: metrics.wpm,
    fillerCount: metrics.fillerCount,
    fillerRatePer100: metrics.fillerRatePer100,
    pauseCount: metrics.pauseCount,
    eyeContactPct: metrics.eyeContactPct,
    smilePct: metrics.smilePct,
    engagedExpressionPct: metrics.engagedExpressionPct,
    dominantExpression: metrics.dominantExpression,
    volumeMeanDb: metrics.volumeMeanDb,
    volumeVariationDb: metrics.volumeVariationDb,
    volumeAboveFloorDb: metrics.volumeAboveFloorDb,
    toneVariationSemitones: metrics.toneVariationSemitones,
    meanPitchHz: metrics.meanPitchHz,
    videoId,
  });
  localStorage.setItem("speakwell_history", JSON.stringify(hist.slice(0, 50)));
  if (videoId) saveVideoBlob(videoId, recState.videoBlob);
}

function fmt(val, suffix = "") {
  return val === null || val === undefined ? "—" : val + suffix;
}

function renderHistory() {
  const hist = JSON.parse(localStorage.getItem("speakwell_history") || "[]");
  const wrap = document.getElementById("historyTable");
  if (!hist.length) {
    wrap.innerHTML = `<div class="empty-state">No appraisals yet — record a practice session to see it here.</div>`;
    return;
  }

  wrap.innerHTML = hist
    .map((h, i) => {
      const scores = h.scores || {};
      const scoreChips = Object.entries(SCORE_LABELS)
        .map(([key, label]) => `<div><div class="label">${label}</div><div class="val">${fmt(scores[key])}</div></div>`)
        .join("");

      return `
      <div class="history-card">
        <div class="history-card-summary" data-toggle="${i}">
          <div class="hc-date">${new Date(h.date).toLocaleDateString()}</div>
          <div class="hc-topic">${h.topic}</div>
          <div class="hc-score">${h.overallScore}</div>
          <div class="hc-arrow">▾</div>
        </div>
        <div class="score-breakdown history-chips">${scoreChips}</div>
        <div class="score-breakdown history-details" id="hist-details-${i}" style="display:none">
          <div><div class="label">Duration</div><div class="val">${fmt(h.durationSec, "s")}</div></div>
          <div><div class="label">Words</div><div class="val">${fmt(h.wordCount)}</div></div>
          <div><div class="label">WPM</div><div class="val">${fmt(h.wpm)}</div></div>
          <div><div class="label">Filler words</div><div class="val">${fmt(h.fillerCount)} (${fmt(h.fillerRatePer100)}/100w)</div></div>
          <div><div class="label">Long pauses</div><div class="val">${fmt(h.pauseCount)}</div></div>
          <div><div class="label">Eye contact</div><div class="val">${fmt(h.eyeContactPct, "%")}</div></div>
          <div><div class="label">Expression</div><div class="val">${fmt(h.dominantExpression)}</div></div>
          <div><div class="label">Smile</div><div class="val">${fmt(h.smilePct, "%")}</div></div>
          <div><div class="label">Engaged expression</div><div class="val">${fmt(h.engagedExpressionPct, "%")}</div></div>
          <div><div class="label">Volume level</div><div class="val">${fmt(h.volumeMeanDb, "dBFS")}</div></div>
          <div><div class="label">Volume above room noise</div><div class="val">${fmt(h.volumeAboveFloorDb, "dB")}</div></div>
          <div><div class="label">Volume variation (range)</div><div class="val">${fmt(h.volumeVariationDb, "dB")}</div></div>
          <div><div class="label">Tone variation</div><div class="val">${fmt(h.toneVariationSemitones, " semitones")}</div></div>
          <div><div class="label">Mean pitch</div><div class="val">${fmt(h.meanPitchHz, "Hz")}</div></div>
        </div>
        ${h.videoId ? `
        <div class="history-video-row">
          <button class="btn ghost" data-play-video="${i}">▶ Watch recording</button>
          <video class="history-video-player" id="hist-video-${i}" style="display:none" controls></video>
        </div>` : ""}
      </div>`;
    })
    .join("");

  wrap.querySelectorAll("[data-toggle]").forEach((el) => {
    el.addEventListener("click", () => {
      const details = document.getElementById(`hist-details-${el.dataset.toggle}`);
      const isOpen = details.style.display !== "none";
      details.style.display = isOpen ? "none" : "grid";
      el.querySelector(".hc-arrow").textContent = isOpen ? "▾" : "▴";
    });
  });

  wrap.querySelectorAll("[data-play-video]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = btn.dataset.playVideo;
      const videoEl = document.getElementById(`hist-video-${idx}`);
      if (videoEl.style.display !== "none") {
        videoEl.pause();
        videoEl.style.display = "none";
        btn.textContent = "▶ Watch recording";
        return;
      }
      btn.textContent = "Loading...";
      const blob = await getVideoBlob(hist[idx].videoId);
      console.log("[SpeakWell recording diag] playback fetch", {
        videoId: hist[idx].videoId,
        found: !!blob,
        size: blob ? blob.size : null,
      });
      if (!blob) {
        btn.textContent = "Recording unavailable";
        return;
      }
      videoEl.src = URL.createObjectURL(blob);
      videoEl.style.display = "block";
      btn.textContent = "▲ Hide recording";
    });
  });
}
