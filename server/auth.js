import crypto from "crypto";

function parseInitData(initData) {
  // initData comes like "query_id=...&user=...&auth_date=...&hash=..."
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");

  // sort by key and build check string
  const pairs = [];
  for (const [key, value] of params.entries()) {
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const checkString = pairs.join("\n");
  return { hash, checkString, params };
}

export function verifyInitData(initData, botToken) {
  const { hash, checkString } = parseInitData(initData);
  if (!hash) return false;

  // Secret key = HMAC_SHA256("WebAppData", botToken)
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calcHash = crypto
    .createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(calcHash, "hex"));
}

export function extractUser(initData) {
  const params = new URLSearchParams(initData);
  const userStr = params.get("user");
  try { return JSON.parse(userStr); } catch { return null; }
}
