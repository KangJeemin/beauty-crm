import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'crypto';

const BCRYPT_ROUNDS = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** 로그인 실패 시에도 비교 시간을 맞추기 위한 더미 해시 (아이디 존재 여부 노출 방지) */
export const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** Refresh Token 원문 (불투명 랜덤 문자열) */
export const newOpaqueToken = () => randomBytes(48).toString('base64url');

/** 헷갈리는 글자(0/O, 1/I/L)를 뺀 대문자+숫자 */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCode = (len = 8) => Array.from({ length: len }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');

/** 임시 비밀번호: 영문+숫자 10자 */
export const newTempPassword = () => {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (s: string) => s[randomInt(s.length)];
  const base = Array.from({ length: 8 }, () => pick(letters + digits)).join('');
  return base + pick(letters) + pick(digits);
};
