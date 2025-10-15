// server/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import TelegramBot from "node-telegram-bot-api";

import store from "./store.js";
import { verifyInitData, extractUser } from "./auth.js";

// ---------- Express basics ----------
const app = express();
app.set("trust proxy", 1);
app.use(express.json());
app.use(cookieParser());

// ---------- CORS (Vercel + previews) ----------
const envOrigins = (process.env.CORS_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
const corsOptions = {
  origin: (origin, cb) => {
    // Allow no-origin (e.g., curl/health checks)
    if (!origin) return cb(null, true);

    const allowList = [
      "https://telegram-miniapp-black.vercel.app", // <- your Vercel domain
      ...envOrigins
    ];

    const allow = allowList.includes(origin) || /\.vercel\.app$/.test(origin);
    cb(null, allow);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-Telegram-InitData"],
  optionsSuccessStatus: 204,
  credentials: false
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// ---------- Telegram Bot (opens the WebApp) ----------
if (!process.env.BOT_TOKEN) {
  console.error("Missing BOT_TOKEN in environment");
  process.exit(1);
}
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// CHANGE THIS to your deployed Vercel URL:
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

// ---------- Auth helper (verify Telegram WebApp initData) ----------
function mustBeTelegramWebApp(req, res, next) {
  const initData = req.header("X-Telegram-InitData") || req.body?.initData;
  if (!initData) {
    console.log("Auth: missing initData header/body");
    return res.status(401).json({ ok: false, error: "MISSING_INITDATA" });
  }
  const ok = verifyInitData(initData, process.env.BOT_TOKEN);
  if (!ok) {
    console.log("Auth: BAD_INITDATA (token mismatch or corrupted)");
    return res.status(401).json({ ok: false, error: "BAD_INITDATA" });
  }
  req.tgUser = extractUser(initData);
  if (!req.tgUser?.id) {
    console.log("Auth: no user in initData");
    return res.status(401).json({ ok: false, error: "NO_USER" });
  }
  next();
}

// ---------- API: bootstrap / drop / records ----------
app.post("/api/bootstrap", mustBeTelegramWebApp, (req, res) => {
  const uid = req.tgUser.id;
  store.maybeRefill(uid);
  const u = store.getUser(uid);
  return res.json({
    ok: true,
    user: {
      id: uid,
      first_name: req.tgUser.first_name,
      username: req.tgUser.username
    },
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

  // Plinko-like prize table (center is more likely)
  const bins = [100, 75, 50, 35, 20, 10, 20, 35, 50, 75, 100];
  const mid = (bins.length - 1) / 2;
  const weights = bins.map((_, i) => 1 / (1 + Math.pow(Math.abs(i - mid), 2)));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let idx = 0;
  while (r > weights[idx]) { r -= weights[idx]; idx++; }
  const prize = bins[idx];

  const newTotal = store.addPoints(uid, prize);
  return res.json({
    ok: true,
    prize,
    binIndex: idx,
    points: newTotal,
    ballsLeft: store.getUser(uid).balls,
    nextRefillIn: store.secondsToNextRefill(uid)
  });
});

app.post("/api/records", mustBeTelegramWebApp, (req, res) => {
  const uid = req.tgUser.id;
  const u = store.getUser(uid);
  return res.json({ ok: true, points: u.points, balls: u.balls });
});

// ---------- Health check ----------
app.get("/healthz", (_req, res) => res.send("ok"));

// ---------- Start server ----------
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`API listening on :${port}`);
  console.log(`WebApp URL configured as: ${webAppUrl}`);
});
