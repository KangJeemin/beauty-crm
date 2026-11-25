import { HealthStatus } from '@beauty-crm/shared';
import { Controller, Get, HttpCode } from '@nestjs/common';
import { Public } from '../common/auth/decorators';
import { DataSource } from 'typeorm';
import { StorageService } from '../common/storage/storage.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @HttpCode(200)
  async check(): Promise<HealthStatus> {
    let db: HealthStatus['db'] = 'down';
    try {
      await this.dataSource.query('SELECT 1');
      db = 'up';
    } catch {
      db = 'down';
    }
    const storage: HealthStatus['storage'] = (await this.storage.isHealthy()) ? 'up' : 'down';
    const status = db === 'up' && storage === 'up' ? 'ok' : 'error';
    return { status, db, storage, time: new Date().toISOString() };
  }
}
