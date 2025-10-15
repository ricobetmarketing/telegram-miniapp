// --- Configure your API URL (Render) ---
const API = "https://ricobet-miniapp-api.onrender.com"; // ← change if your Render URL differs

// --- Telegram Mini App bootstrap & diagnostics ---
const tg = window.Telegram?.WebApp;
tg?.expand();
tg?.MainButton?.hide();

// If opened outside Telegram, initData is empty — show a helpful hint
if (!tg || !tg.initData) {
  console.warn("NO_INITDATA_FROM_TELEGRAM: Open this from your bot button, not in a normal browser tab.");
}

// --- Helper to call server with initData in HEADER + BODY (for reliability) ---
async function callApi(path, body = {}) {
  const initData = window.Telegram?.WebApp?.initData || "";
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-InitData": initData
    },
    body: JSON.stringify({ ...body, initData })
  });
  try {
    return await res.json();
  } catch (e) {
    return { ok: false, error: "BAD_JSON_RESPONSE" };
  }
}

// --- UI refs ---
const pointsEl = document.getElementById("points");
const ballsEl  = document.getElementById("balls");
const timerEl  = document.getElementById("timer");
const binsWrap = document.getElementById("bins");
const grid     = document.getElementById("plinko");
const btnDrop  = document.getElementById("btnDrop");
const btnRec   = document.getElementById("btnRecords");

// --- Build Plinko board ---
function buildBoard() {
  const cols = 11, rows = 10, spacing = 28;
  const w = grid.clientWidth;
  const offsetX = (w - (cols - 1) * spacing) / 2;
  grid.innerHTML = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - (r % 2 ? 1 : 0); c++) {
      const dot = document.createElement("div");
      dot.className = "dot";
      const x = offsetX + c * spacing + (r % 2 ? spacing / 2 : 0);
      const y = 30 + r * spacing;
      dot.style.transform = `translate(${x}px, ${y}px)`;
      grid.appendChild(dot);
    }
  }
}
buildBoard();
window.addEventListener("resize", buildBoard);

// --- Bins UI ---
const binValues = [100, 75, 50, 35, 20, 10, 20, 35, 50, 75, 100];
function buildBins() {
  binsWrap.innerHTML = "";
  binValues.forEach(v => {
    const b = document.createElement("div");
    b.className = "bin";
    b.textContent = v;
    binsWrap.appendChild(b);
  });
}
buildBins();

// --- Countdown ---
let nextLeft = 0, timerInt = null;
function startTimer() {
  if (timerInt) clearInterval(timerInt);
  const tick = () => {
    const m = Math.floor(nextLeft / 60), s = nextLeft % 60;
    timerEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    if (nextLeft > 0) nextLeft--; else clearInterval(timerInt);
  };
  tick();
  timerInt = setInterval(tick, 1000);
}

// --- Bootstrap from server (auth check happens there) ---
(async () => {
  const r = await callApi("/api/bootstrap");
  if (!r.ok) {
    alert(r.error || "Auth failed. Open from Telegram again.");
    return;
  }
  pointsEl.textContent = r.points;
  ballsEl.textContent = r.balls;
  nextLeft = r.nextRefillIn || 0;
  startTimer();
})();

// --- Drop animation + server prize ---
async function drop() {
  btnDrop.disabled = true;

  const ball = document.createElement("div");
  ball.className = "ball";
  grid.appendChild(ball);

  // Simple client animation (visual only)
  let x = grid.clientWidth / 2, y = 0, vy = 2, vx = (Math.random() - .5) * 2;
  const loop = () => {
    vy += 0.25; y += vy; x += vx;
    if (x < 10 || x > grid.clientWidth - 10) vx *= -1;
    ball.style.transform = `translate(${x}px, ${y}px)`;
    if (y < grid.clientHeight - 40) requestAnimationFrame(loop);
  };
  loop();

  // Ask server to decide prize & update totals
  const result = await callApi("/api/drop");
  if (!result.ok) {
    ball.remove();
    btnDrop.disabled = false;
    if (result.error === "NO_BALLS") {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("warning");
      alert("Out of balls. Please wait for refill.");
    } else {
      alert(result.error || "Drop failed");
    }
    return;
  }

  // Highlight the bin server says we hit
  const idx = result.binIndex;
  binsWrap.querySelectorAll(".bin").forEach((el, i) => {
    el.classList.toggle("active", i === idx);
  });
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium");

  // Update counters
  pointsEl.textContent = result.points;
  ballsEl.textContent = result.ballsLeft;
  nextLeft = result.nextRefillIn || 0; startTimer();

  setTimeout(() => { ball.remove(); btnDrop.disabled = false; }, 900);
}

// --- Events ---
btnDrop.addEventListener("click", drop);
grid.addEventListener("click", drop);
btnRec.addEventListener("click", async () => {
  const r = await callApi("/api/records");
  if (!r.ok) return alert(r.error || "Error");
  alert(`Points: ${r.points}\nBalls: ${r.balls}`);
});
