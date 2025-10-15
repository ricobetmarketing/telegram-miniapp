// server/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import TelegramBot from "node-telegram-bot-api";

import store from "./store.js";
import { verifyInitData, extractUser } from "./auth.js";

// ---------- Express ----------
const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser());

// ---------- CORS (allow your Vercel domain + previews) ----------
const corsOptions = {
  origin: (origin, cb) => {
    // allow no-origin (curl/health checks)
    if (!origin) return cb(null, true);

    const allowList = [
      "https://telegram-miniapp-black.vercel.app" // ← your Vercel domain (change if needed)
    ];
    const allowed = allowList.includes(origin) || /\.vercel\.app$/.test(origin);
    cb(null, allowed);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Telegram-InitData"],
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ---------- Telegram Bot ----------
if (!process.env.BOT_TOKEN) {
  console.error("❌ Missing BOT_TOKEN in environment");
  process.exit(1);
}
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// IMPORTANT: point this to your deployed frontend
const webAppUrl = "https://telegram-miniapp-black.vercel.app";

bot.onText(/\/start/i, (msg) => {
  const chatId = msg.chat.id;
  const keyboard = {
    keyboard: [[{ text: "🎮 Play Game", web_app: { url: webAppUrl } }]],
    resize_keyboard: true,
    one_time_keyboard: false
  };
  bot.sendMessage(
    chatId,
    "Welcome to Rico.bet Mini Game! Tap the button to play.",
    { reply_markup: keyboard }
  );
});

// ---------- Auth middleware ----------
const DEV_SKIP_VERIFY = process.env.DEV_SKIP_VERIFY === "1";

function mustBeTelegramWebApp(req, res, next) {
  const initData = req.header("X-Telegram-InitData") || req.body?.initData;

  if (!initData) {
    console.log("Auth: MISSING_INITDATA");
    return res.status(401).json({ ok: false, error: "MISSING_INITDATA" });
  }
  if (!DEV_SKIP_VERIFY) {
    const ok = verifyInitData(initData, process.env.BOT_TOKEN);
    if (!ok) {
      console.log("Auth: BAD_INITDATA");
      return res.status(401).json({ ok: false, error: "BAD_INITDATA" });
    }
  } else {
    console.log("Auth: DEV_SKIP_VERIFY=1 (bypassing hash check)");
  }

  const user = extractUser(initData);
  if (!user?.id) {
    console.log("Auth: NO_USER");
    return res.status(401).json({ ok: false, error: "NO_USER" });
  }
  req.tgUser = user;
  next();
}

// ---------- API routes ----------
app.post("/api/bootstrap", mustBeTelegramWebApp, (req, res) => {
  const uid = req.tgUser.id;
  store.maybeRefill(uid);
  const u = store.getUser(uid);
  res.json({
    ok: true,
    user: { id: uid, first_name: req.tgUser.first_name, username: req.tgUser.username },
    points: u.points,
    balls: u.balls,
    nextRefillIn: store.secondsToNextRefill(uid)
  });
});

app.post("/api/drop", mustBeTelegramWebApp, (req, res) => {
  const uid = req.tgUser.id;
  store.maybeRefill(uid);

  if (!store.spendBall(uid)) {
    return res.json({ ok: false, error: "NO_BALLS" });
  }

  // Server decides the prize (center more likely)
  const bins = [100, 75, 50, 35, 20, 10, 20, 35, 50, 75, 100];
  const mid = (bins.length - 1) / 2;
  const weights = bins.map((_, i) => 1 / (1 + Math.pow(Math.abs(i - mid), 2)));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let idx = 0;
  while (r > weights[idx]) { r -= weights[idx]; idx++; }
  const prize = bins[idx];

  const totalPoints = store.addPoints(uid, prize);
  res.json({
    ok: true,
    prize,
    binIndex: idx,
    points: totalPoints,
    ballsLeft: store.getUser(uid).balls,
    nextRefillIn: store.secondsToNextRefill(uid)
  });
});

app.post("/api/records", mustBeTelegramWebApp, (req, res) => {
  const uid = req.tgUser.id;
  const u = store.getUser(uid);
  res.json({ ok: true, points: u.points, balls: u.balls });
});

// ---------- Health check ----------
app.get("/healthz", (_req, res) => res.send("ok"));

// ---------- Start ----------
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`API listening on :${port}`);
  console.log(`WebApp URL: ${webAppUrl}`);
});
