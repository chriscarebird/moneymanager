import { type Context, type Next } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import bcrypt from 'bcryptjs';

/**
 * Auth configuration for the two hardcoded users.
 * Passwords are bcrypt-compared against hashed env vars.
 */

export interface AuthUser {
  id: string;
  name: string;
}

export interface SessionPayload extends JWTPayload {
  userId: string;
  userName: string;
}

const COOKIE_NAME = 'investpilot_session';
const SESSION_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getSecretKey(): Uint8Array {
  const secret = process.env['SESSION_SECRET'];
  if (!secret) {
    throw new Error('SESSION_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Get user credentials from environment variables.
 * USER1_PASSWORD and USER2_PASSWORD should be bcrypt hashes.
 */
function getUserCredentials(): Array<{ id: string; name: string; passwordHash: string }> {
  const user1Password = process.env['USER1_PASSWORD'];
  const user2Password = process.env['USER2_PASSWORD'];

  if (!user1Password || !user2Password) {
    throw new Error('USER1_PASSWORD and USER2_PASSWORD environment variables must be set');
  }

  return [
    { id: 'user1', name: 'user1', passwordHash: user1Password },
    { id: 'user2', name: 'user2', passwordHash: user2Password },
  ];
}

/**
 * Verify username + password and return user if valid.
 */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<AuthUser | null> {
  const users = getUserCredentials();
  const user = users.find((u) => u.name === username);
  if (!user) return null;

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) return null;

  return { id: user.id, name: user.name };
}

/**
 * Create a signed JWT session token.
 */
export async function createSessionToken(user: AuthUser): Promise<string> {
  const secret = getSecretKey();
  const payload: SessionPayload = {
    userId: user.id,
    userName: user.name,
  };

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_EXPIRY_SECONDS}s`)
    .sign(secret);
}

/**
 * Verify and decode a JWT session token.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Set the session cookie on the response.
 */
export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'Strict',
    maxAge: SESSION_EXPIRY_SECONDS,
    path: '/',
  });
}

/**
 * Clear the session cookie.
 */
export function clearSessionCookie(c: Context): void {
  setCookie(c, COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'Strict',
    maxAge: 0,
    path: '/',
  });
}

/**
 * Hono middleware that requires a valid session.
 * Attaches the authenticated user to the context.
 */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const token = getCookie(c, COOKIE_NAME);

  if (!token) {
    return c.json({ data: null, error: 'Unauthorized — no session', meta: undefined }, 401);
  }

  const session = await verifySessionToken(token);
  if (!session) {
    clearSessionCookie(c);
    return c.json({ data: null, error: 'Unauthorized — invalid or expired session', meta: undefined }, 401);
  }

  // Attach user to context variables
  c.set('userId', session.userId);
  c.set('userName', session.userName);

  await next();
}
