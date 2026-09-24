import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { one, run, transaction } from "./db";
import { ApiError } from "./validation";
import { getUser, now, type User } from "./service";

export const COOKIE_NAME = "chatflow_session";
const SESSION_AGE = 60 * 60 * 24 * 30;
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await derive(password, salt)).toString("hex")}`;
}
async function verify(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const actual = await derive(password, salt);
  const expected = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function register(input: {
  email: string;
  password: string;
  displayName: string;
}) {
  const hash = await hashPassword(input.password);
  return transaction(() => {
    if (one("SELECT 1 FROM users WHERE email=?", input.email))
      throw new ApiError(409, "Email is already registered.");
    const id = randomUUID();
    run(
      "INSERT INTO users (id,email,password_hash,display_name,created_at) VALUES (?,?,?,?,?)",
      id,
      input.email,
      hash,
      input.displayName,
      now(),
    );
    run("INSERT INTO settings (user_id) VALUES (?)", id);
    return id;
  });
}
export async function login(email: string, password: string) {
  const user = one<User>("SELECT * FROM users WHERE email=?", email);
  // Execute the same KDF for missing accounts to avoid a cheap timing oracle.
  const valid = await verify(
    password,
    user?.password_hash || `${"0".repeat(32)}:${"0".repeat(128)}`,
  );
  if (!user || !user.password_hash || !valid)
    throw new ApiError(401, "Incorrect email or password.");
  return user.id;
}
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function sessionToken(request: Request) {
  return (
    (request.headers.get("cookie") || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${COOKIE_NAME}=`))
      ?.slice(COOKIE_NAME.length + 1) || ""
  );
}
export function authenticate(request: Request) {
  const token = sessionToken(request);
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new ApiError(401, "Please sign in to continue.");
  const session = one<{ user_id: string }>(
    "SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?",
    digest(token),
    Date.now(),
  );
  if (!session)
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  return getUser(session.user_id);
}
export function revoke(request: Request) {
  run("DELETE FROM sessions WHERE token_hash=?", digest(sessionToken(request)));
}
function cookie(value: string, age: number) {
  const secure =
    process.env.COOKIE_SECURE === "true" ||
    (process.env.COOKIE_SECURE !== "false" &&
      process.env.NODE_ENV === "production");
  return `${COOKIE_NAME}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure ? "; Secure" : ""}`;
}
export function createSession(userId: string, request: Request) {
  const token = randomBytes(32).toString("hex");
  transaction(() => {
    revoke(request);
    run("DELETE FROM sessions WHERE expires_at<=?", Date.now());
    run(
      "INSERT INTO sessions VALUES (?,?,?)",
      digest(token),
      userId,
      Date.now() + SESSION_AGE * 1000,
    );
  });
  return cookie(token, SESSION_AGE);
}
export function clearCookie() {
  return cookie("", 0);
}
export function rateLimit(key: string, limit: number, windowMs: number) {
  const blocked = transaction(() => {
    run("DELETE FROM rate_limits WHERE reset_at<=?", Date.now());
    run(
      "INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
      key,
      Date.now() + windowMs,
    );
    return (
      Number(one("SELECT count FROM rate_limits WHERE key=?", key)?.count) >
      limit
    );
  });
  if (blocked)
    throw new ApiError(429, "Too many requests. Please try again shortly.");
}
