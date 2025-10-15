// Super-simple in-memory store (per process). Replace with Postgres later.
const users = new Map(); // key: tg_user_id  -> { points, balls, lastRefillAt }

const START_BALLS = 60;      // daily cap or session cap
const REFILL_EVERY_SEC = 600; // every 10 minutes give 10 balls
const REFILL_AMOUNT = 10;

function getUser(uid) {
  if (!users.has(uid)) {
    users.set(uid, {
      points: 0,
      balls: START_BALLS,
      lastRefillAt: Date.now()
    });
  }
  return users.get(uid);
}

function spendBall(uid) {
  const u = getUser(uid);
  if (u.balls > 0) {
    u.balls -= 1;
    return true;
  }
  return false;
}

function addPoints(uid, amount) {
  const u = getUser(uid);
  u.points += amount;
  return u.points;
}

function secondsToNextRefill(uid) {
  const u = getUser(uid);
  const elapsed = Math.floor((Date.now() - u.lastRefillAt) / 1000);
  const left = REFILL_EVERY_SEC - (elapsed % REFILL_EVERY_SEC);
  return left === REFILL_EVERY_SEC ? 0 : left;
}

function maybeRefill(uid) {
  const u = getUser(uid);
  const elapsed = Math.floor((Date.now() - u.lastRefillAt) / 1000);
  const chunks = Math.floor(elapsed / REFILL_EVERY_SEC);
  if (chunks > 0) {
    u.balls = Math.min(START_BALLS, u.balls + chunks * REFILL_AMOUNT);
    u.lastRefillAt = u.lastRefillAt + chunks * REFILL_EVERY_SEC * 1000;
  }
}

export default {
  getUser, spendBall, addPoints, secondsToNextRefill, maybeRefill
};
