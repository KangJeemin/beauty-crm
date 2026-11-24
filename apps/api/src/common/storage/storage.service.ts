import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

/**
 * S3 호환 파일 저장소 (사진·음성).
 *  - 로컬 / 회사 서버 MVP : SeaweedFS
 *  - 서버 이전 후          : NCP Object Storage, AWS S3 등 — .env 의 STORAGE_* 만 변경
 *
 * DB 에는 파일 경로가 아니라 storageKey(객체 키)만 저장한다.
 * 키 규칙: shops/{shopId}/{photos|voices}/{yyyy}/{mm}/{uuid}.{ext}
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('STORAGE_BUCKET');
    this.client = new S3Client({
      endpoint: config.getOrThrow<string>('STORAGE_ENDPOINT'),
      region: config.get<string>('STORAGE_REGION', 'ap-northeast-2'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('STORAGE_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow<string>('STORAGE_SECRET_KEY'),
      },
      // SeaweedFS·NCP 등 S3 호환 저장소는 path-style(http://host/bucket/key)이 안전
      forcePathStyle: config.get<string>('STORAGE_FORCE_PATH_STYLE', 'true') === 'true',
    });
  }

  /** 서버 시작 시 버킷이 없으면 만든다. 저장소가 꺼져 있어도 API 부팅은 막지 않는다. */
  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucket();
    } catch (e) {
      this.logger.warn(`파일 저장소 연결 실패 — 업로드 기능이 동작하지 않습니다: ${(e as Error).message}`);
    }
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`버킷 생성: ${this.bucket}`);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getBuffer(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as Readable) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async getStream(key: string): Promise<{ stream: Readable; contentType?: string; length?: number }> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return { stream: res.Body as Readable, contentType: res.ContentType, length: res.ContentLength };
  }

  /**
   * 파일 자체를 지운다. DB 행의 소프트 삭제(delState)와는 별개 —
   * 원본 음성 30일 자동 삭제처럼 "파일만" 지울 때 사용하고 DB 에는 fileDeletedAt 을 남긴다.
   */
  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
