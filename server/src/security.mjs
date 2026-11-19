import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(derive);

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(':');
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
