import { CustomerDetail, CustomerListItem, ErrorCode, Paged } from '@beauty-crm/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Not, Repository } from 'typeorm';
import { ShopAuth } from '../../common/auth/auth.types';
import { PhoneCipher } from '../../common/crypto/phone-cipher.service';
import { AppException, Errors } from '../../common/errors/app.exception';
import { TenantRepository } from '../../common/repositories/base.repository';
import { TagService } from '../tag/tag.service';
import { CustomerCreateDto, CustomerListQuery, CustomerUpdateDto } from './dto/customer.dto';
import { Customer } from './entities/customer.entity';

const CONSENT_VERSION = 'v1';

@Injectable()
export class CustomerRepository extends TenantRepository<Customer> {
  constructor(@InjectRepository(Customer) repo: Repository<Customer>) {
    super(repo);
  }
}

const invalidPhone = () =>
  new AppException(ErrorCode.VALIDATION, '전화번호를 확인해 주세요. (예: 010-1234-5678)', HttpStatus.BAD_REQUEST);

@Injectable()
export class CustomerService {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly cipher: PhoneCipher,
    private readonly tags: TagService,
    private readonly ds: DataSource,
  ) {}

  /**
   * 목록 · 검색
   *  - 숫자 4자리      → 뒷자리 일치 (가장 많이 쓰는 방식)
   *  - 숫자 9~11자리   → 전체 번호 정확 일치 (HMAC 비교)
   *  - 숫자 1~3자리    → 뒷자리에 포함
   *  - 그 외           → 이름에 포함
   */
  async list(auth: ShopAuth, q: CustomerListQuery): Promise<Paged<CustomerListItem>> {
    const page = q.page ?? 1;
    const size = q.size ?? 30;
    const qb = this.customers.qbForShop(auth.shopId, 'c');

    const text = (q.q ?? '').trim();
    if (text) {
      const digits = text.replace(/[\s-]/g, '');
      if (/^\d+$/.test(digits)) {
        if (digits.length === 4) qb.andWhere('c.phoneLast4 = :l4', { l4: digits });
        else if (digits.length >= 9) {
          const norm = PhoneCipher.normalize(digits);
          qb.andWhere('c.phoneHash = :h', { h: norm ? this.cipher.hash(norm) : '-' });
        } else if (digits.length < 4) qb.andWhere('c.phoneLast4 LIKE :l4', { l4: `%${digits}%` });
        else qb.andWhere('c.phoneLast4 = :l4', { l4: digits.slice(-4) });
      } else {
        qb.andWhere(
          new Brackets((w) => {
            w.where('c.name LIKE :name', { name: `%${escapeLike(text)}%` });
          }),
        );
      }
    }
    if (q.tagId) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM customer_tag ct WHERE ct.customerId = c.id AND ct.tagId = :tagId AND ct.delState = 0)',
        { tagId: q.tagId },
      );
    }

    switch (q.sort ?? 'recent') {
      case 'name':
        qb.orderBy('c.name', 'ASC').addOrderBy('c.id', 'DESC');
        break;
      case 'created':
        qb.orderBy('c.createdAt', 'DESC').addOrderBy('c.id', 'DESC');
        break;
      default:
        // 최근 방문순, 방문 기록 없는 고객은 최근 등록순으로 뒤에
        qb.orderBy('c.lastVisitAt IS NULL', 'ASC').addOrderBy('c.lastVisitAt', 'DESC').addOrderBy('c.createdAt', 'DESC');
    }

    const [rows, total] = await qb.skip((page - 1) * size).take(size).getManyAndCount();
    const tagMap = await this.tags.tagsOf(auth.shopId, rows.map((r) => r.id));
    return { items: rows.map((c) => this.toListItem(c, tagMap.get(c.id) ?? [])), total, page, size };
  }

  async get(auth: ShopAuth, id: number): Promise<CustomerDetail> {
    const c = await this.mustGet(auth.shopId, id);
    const tagMap = await this.tags.tagsOf(auth.shopId, [c.id]);
    return this.toDetail(c, tagMap.get(c.id) ?? []);
  }

  /** 같은 번호로 이미 등록된 고객 (입력 중 미리 알려주기용) */
  async findByPhone(auth: ShopAuth, phone: string, excludeId?: number): Promise<CustomerListItem | null> {
    const norm = PhoneCipher.normalize(phone);
    if (!norm) return null;
    const c = await this.customers.findOne({
      where: { shopId: auth.shopId, phoneHash: this.cipher.hash(norm), ...(excludeId ? { id: Not(excludeId) } : {}) },
    });
    return c ? this.toListItem(c, []) : null;
  }

  async create(auth: ShopAuth, dto: CustomerCreateDto): Promise<CustomerDetail> {
    const phone = this.preparePhone(dto.phone);
    if (phone.phoneHash) await this.assertPhoneFree(auth.shopId, phone.phoneHash);

    const id = await this.ds.transaction(async (em) => {
      const c = await em.getRepository(Customer).save(
        em.getRepository(Customer).create({
          shopId: auth.shopId,
          name: dto.name,
          ...phone,
          gender: dto.gender ?? null,
          birthYear: dto.birthYear ?? null,
          memo: dto.memo ?? null,
          consentAt: dto.consent ? new Date() : null,
          consentVersion: dto.consent ? CONSENT_VERSION : null,
        }),
      );
      if (dto.tagIds?.length) await this.tags.setCustomerTags(em, auth.shopId, c.id, dto.tagIds);
      return c.id;
    });
    return this.get(auth, id);
  }

  async update(auth: ShopAuth, id: number, dto: CustomerUpdateDto): Promise<CustomerDetail> {
    const c = await this.mustGet(auth.shopId, id);
    if (dto.phone !== undefined) {
      const phone = this.preparePhone(dto.phone);
      if (phone.phoneHash && phone.phoneHash !== c.phoneHash) await this.assertPhoneFree(auth.shopId, phone.phoneHash, c.id);
      Object.assign(c, phone);
    }
    if (dto.name !== undefined) c.name = dto.name;
    if (dto.gender !== undefined) c.gender = dto.gender;
    if (dto.birthYear !== undefined) c.birthYear = dto.birthYear;
    if (dto.memo !== undefined) c.memo = dto.memo;
    if (dto.consent !== undefined) {
      if (dto.consent && !c.consentAt) {
        c.consentAt = new Date();
        c.consentVersion = CONSENT_VERSION;
      } else if (!dto.consent) {
        c.consentAt = null;
        c.consentVersion = null;
      }
    }
    await this.ds.transaction(async (em) => {
      await em.getRepository(Customer).save(c);
      if (dto.tagIds !== undefined) await this.tags.setCustomerTags(em, auth.shopId, c.id, dto.tagIds);
    });
    return this.get(auth, id);
  }

  /** 소프트 삭제 — 시술·결제 기록은 그대로 남는다 */
  async remove(auth: ShopAuth, id: number): Promise<void> {
    if (!(await this.customers.softDeleteForShop(auth.shopId, id))) throw Errors.notFound('고객');
  }

  // ── 내부 ─────────────────────────────────────────────

  private preparePhone(input: string | null | undefined) {
    if (!input) return { phoneEnc: null, phoneHash: null, phoneLast4: null };
    const norm = PhoneCipher.normalize(input);
    if (!norm) throw invalidPhone();
    return { phoneEnc: this.cipher.encrypt(norm), phoneHash: this.cipher.hash(norm), phoneLast4: PhoneCipher.last4(norm) };
  }

  private async assertPhoneFree(shopId: number, phoneHash: string, excludeId?: number) {
    const dup = await this.customers.findOne({
      where: { shopId, phoneHash, ...(excludeId ? { id: Not(excludeId) } : {}) },
    });
    if (dup) {
      throw new AppException(
        ErrorCode.DUPLICATE,
        `이미 등록된 번호입니다. (${dup.name} 고객님, 뒷자리 ${dup.phoneLast4})`,
        HttpStatus.CONFLICT,
      );
    }
  }

  private async mustGet(shopId: number, id: number): Promise<Customer> {
    const c = await this.customers.findOneForShop(shopId, id);
    if (!c) throw Errors.notFound('고객');
    return c;
  }

  private toListItem(c: Customer, tags: CustomerListItem['tags']): CustomerListItem {
    return {
      id: c.id,
      name: c.name,
      phoneMasked: PhoneCipher.mask(c.phoneLast4),
      phoneLast4: c.phoneLast4,
      gender: c.gender,
      lastVisitAt: c.lastVisitAt ? c.lastVisitAt.toISOString() : null,
      visitCount: c.visitCount,
      tags,
    };
  }

  private toDetail(c: Customer, tags: CustomerListItem['tags']): CustomerDetail {
    return {
      ...this.toListItem(c, tags),
      phone: this.cipher.decrypt(c.phoneEnc),
      birthYear: c.birthYear,
      memo: c.memo,
      firstVisitAt: c.firstVisitAt ? c.firstVisitAt.toISOString() : null,
      totalPaidAmount: c.totalPaidAmount,
      consentAt: c.consentAt ? c.consentAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    };
  }
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}
