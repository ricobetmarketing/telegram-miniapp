import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import TelegramBot from "node-telegram-bot-api";
import store from "./store.js";
import { verifyInitData, extractUser } from "./auth.js";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || "*"}));

// --- Telegram bot (reply with WebApp button) ---
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

bot.onText(/\/start/i, (msg) => {
  const chatId = msg.chat.id;
  const webAppUrl = "https://YOUR_FRONTEND_URL/index.html"; // <== change this
  const keyboard = {
    keyboard: [[{ text: "🎮 Play Game", web_app: { url: webAppUrl } }]],
    resize_keyboard: true,
    one_time_keyboard: false
  };
  bot.sendMessage(chatId,
    "Welcome to Rico.bet Mini Game! Tap the button to play.",
    { reply_markup: keyboard }
  );
});

// --- Helpers to auth WebApp calls ---
function mustBeTelegramWebApp(req, res, next) {
  const initData = req.header("X-Telegram-InitData") || req.body?.initData;
  if (!initData) return res.status(401).json({ ok:false, error:"Missing initData" });
  if (!verifyInitData(initData, process.env.BOT_TOKEN)) {
    return res.status(401).json({ ok:false, error:"Bad initData" });
  }
  req.tgUser = extractUser(initData);
  next();
}

// --- API routes used by the web app ---
app.post("/api/bootstrap", mustBeTelegramWebApp, (req, res) => {
  const uid = req.tgUser?.id;
  store.maybeRefill(uid);
  const u = store.getUser(uid);
  res.json({
    ok: true,
    user: { id: uid, first_name: req.tgUser?.first_name, username: req.tgUser?.username },
    points: u.points,
    balls: u.balls,
    nextRefillIn: store.secondsToNextRefill(uid)
  });
});

app.post("/api/drop", mustBeTelegramWebApp, (req, res) => {
  const uid = req.tgUser?.id;
  store.maybeRefill(uid);
  if (!store.spendBall(uid)) {
    return res.json({ ok: false, error: "NO_BALLS" });
  }

  const bins = [100,75,50,35,20,10,20,35,50,75,100]; // like screenshot
  // crude “physics”: weighted random favoring middle bins
  const weights = bins.map((_, i) => {
    const mid = (bins.length - 1) / 2;
    const d = Math.abs(i - mid);
    return 1 / (1 + d*d); // higher in the middle
  });
  const totalW = weights.reduce((a,b)=>a+b,0);
  let r = Math.random() * totalW;
  let idx = 0;
  while (r > weights[idx]) { r -= weights[idx]; idx++; }

  const prize = bins[idx]; // points earned by that drop
  const newTotal = store.addPoints(uid, prize);

  res.json({
    ok: true,
    prize,
    binIndex: idx,
    points: newTotal,
    ballsLeft: store.getUser(uid).balls,
    nextRefillIn: store.secondsToNextRefill(uid)
  });
});

app.post("/api/records", mustBeTelegramWebApp, (req, res) => {
  const uid = req.tgUser?.id;
  const u = store.getUser(uid);
  res.json({ ok: true, points: u.points, balls: u.balls });
});

// health
app.get("/healthz", (_, res) => res.send("ok"));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log("Server listening on", port));
