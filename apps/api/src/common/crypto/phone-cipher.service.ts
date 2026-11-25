import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const VERSION = 1; // 키 교체 시 2,3... 으로 올리고 이전 키로도 복호화
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * 고객 전화번호 보호
 *  - phoneEnc  : AES-256-GCM 암호문  [버전 1B | IV 12B | 인증태그 16B | 암호문]
 *  - phoneHash : HMAC-SHA256(정규화 번호) — 중복 확인 · 전체 번호 정확 검색
 *  - phoneLast4: 뒷자리 4자리 평문 — 빠른 검색 (단독으로는 개인 식별 불가)
 *
 * DB 가 통째로 유출돼도 키(.env)가 없으면 번호 전체를 알 수 없다.
 */
@Injectable()
export class PhoneCipher {
  private readonly encKey: Buffer;
  private readonly hmacKey: Buffer;

  constructor(config: ConfigService) {
    this.encKey = Buffer.from(config.getOrThrow<string>('PHONE_ENC_KEY'), 'hex');
    this.hmacKey = Buffer.from(config.getOrThrow<string>('PHONE_HMAC_KEY'), 'hex');
    if (this.encKey.length !== 32 || this.hmacKey.length !== 32) {
      throw new Error('PHONE_ENC_KEY / PHONE_HMAC_KEY 는 64자리 hex(32바이트)여야 합니다.');
    }
  }

  /** 숫자만 남기고 검증. 올바르지 않으면 null */
  static normalize(input: string | null | undefined): string | null {
    if (!input) return null;
    const d = input.replace(/\D/g, '');
    return /^0\d{8,10}$/.test(d) ? d : null;
  }

  encrypt(digits: string): Buffer {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const enc = Buffer.concat([cipher.update(digits, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), enc]);
  }

  decrypt(blob: Buffer | null): string | null {
    if (!blob || blob.length < 1 + IV_LEN + TAG_LEN) return null;
    if (blob[0] !== VERSION) throw new Error(`지원하지 않는 암호화 버전: ${blob[0]}`);
    const iv = blob.subarray(1, 1 + IV_LEN);
    const tag = blob.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
    const data = blob.subarray(1 + IV_LEN + TAG_LEN);
    const d = createDecipheriv('aes-256-gcm', this.encKey, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  }

  hash(digits: string): string {
    return createHmac('sha256', this.hmacKey).update(digits).digest('hex');
  }

  static last4(digits: string): string {
    return digits.slice(-4);
  }

  static mask(last4: string | null): string | null {
    return last4 ? `***-****-${last4}` : null;
  }
}
