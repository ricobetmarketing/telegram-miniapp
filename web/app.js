const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.MainButton.hide();
}

const API = "https://telegram-miniapp-tb5r.onrender.com"; // <== change to your server

// --- UI refs
const pointsEl = document.getElementById("points");
const ballsEl  = document.getElementById("balls");
const timerEl  = document.getElementById("timer");
const binsWrap = document.getElementById("bins");
const grid     = document.getElementById("plinko");
const btnDrop  = document.getElementById("btnDrop");
const btnRec   = document.getElementById("btnRecords");

// --- Plinko board dots
const cols = 11, rows = 10, spacing = 28;
const offsetX = (grid.clientWidth - (cols-1)*spacing)/2;
for (let r=0; r<rows; r++){
  for (let c=0; c<cols - (r%2?1:0); c++){
    const dot = document.createElement("div");
    dot.className = "dot";
    const x = offsetX + c*spacing + (r%2? spacing/2 : 0);
    const y = 30 + r*spacing;
    dot.style.transform = `translate(${x}px, ${y}px)`;
    grid.appendChild(dot);
  }
}

// --- Bins UI
const binValues = [100,75,50,35,20,10,20,35,50,75,100];
binValues.forEach(v=>{
  const b = document.createElement("div");
  b.className = "bin";
  b.textContent = v;
  binsWrap.appendChild(b);
});

// --- Countdown
let nextLeft = 0, timerInt = null;
function startTimer(){
  if (timerInt) clearInterval(timerInt);
  const tick = ()=>{
    const m = Math.floor(nextLeft/60), s = nextLeft%60;
    timerEl.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    if (nextLeft>0) nextLeft--; else clearInterval(timerInt);
  };
  tick();
  timerInt = setInterval(tick,1000);
}

// --- API helper with initData header
async function callApi(path, body={}){
  const initData = tg?.initData || ""; // Telegram passes it to webapp
  const res = await fetch(`${API}${path}`, {
    method:"POST",
    headers:{ "Content-Type":"application/json", "X-Telegram-InitData": initData },
    body: JSON.stringify({ ...body })
  });
  return res.json();
}

// --- Bootstrap
(async ()=>{
  const r = await callApi("/api/bootstrap");
  if (!r.ok) {
    alert("Auth failed. Open from Telegram again.");
    return;
  }
  pointsEl.textContent = r.points;
  ballsEl.textContent  = r.balls;
  nextLeft = r.nextRefillIn || 0;
  startTimer();
})();

// --- Drop handling (simple animation, server decides prize)
async function drop(){
  btnDrop.disabled = true;

  const ball = document.createElement("div");
  ball.className = "ball";
  grid.appendChild(ball);

  // client-side animation only; prize comes from server
  let x = grid.clientWidth/2, y = 0, vy = 2, vx = (Math.random()-.5)*2;
  const loop = ()=>{
    vy += 0.25; y += vy; x += vx;
    if (x < 10 || x > grid.clientWidth-10) vx *= -1;
    ball.style.transform = `translate(${x}px, ${y}px)`;
    if (y < grid.clientHeight-40) requestAnimationFrame(loop);
  };
  loop();

  const result = await callApi("/api/drop");
  if (!result.ok) {
    ball.remove();
    btnDrop.disabled = false;
    if (result.error === "NO_BALLS") {
      tg?.HapticFeedback?.notificationOccurred("warning");
      alert("Out of balls. Please wait for refill.");
    }
    return;
  }

  // highlight bin & show confetti-ish haptic
  const idx = result.binIndex;
  binsWrap.querySelectorAll(".bin").forEach((el,i)=>{
    el.classList.toggle("active", i===idx);
  });
  tg?.HapticFeedback?.impactOccurred("medium");

  // update stats
  pointsEl.textContent = result.points;
  ballsEl.textContent  = result.ballsLeft;
  nextLeft = result.nextRefillIn || 0; startTimer();

  setTimeout(()=>{ ball.remove(); btnDrop.disabled = false; }, 900);
}

btnDrop.addEventListener("click", drop);
grid.addEventListener("click", drop);
btnRec.addEventListener("click", async ()=>{
  const r = await callApi("/api/records");
  alert(`Points: ${r.points}\nBalls: ${r.balls}`);
});
