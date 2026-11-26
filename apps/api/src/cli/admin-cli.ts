/**
 * 운영자 CLI — 첫 운영자 계정 만들기 · 비상시용 (평소에는 운영자 화면 /admin 사용)
 *
 *   npm run cli -w @beauty-crm/api -- create-admin <loginId> <이름>     → 임시 비밀번호 출력
 *   npm run cli -w @beauty-crm/api -- list-shops [PENDING|ACTIVE|SUSPENDED]
 *   npm run cli -w @beauty-crm/api -- approve <shopId> [--founder]
 *   npm run cli -w @beauty-crm/api -- suspend <shopId>
 *   npm run cli -w @beauty-crm/api -- reset-owner-password <shopId>
 */
import 'reflect-metadata';

process.env.BC_CLI = '1';
import { ShopStatus } from '@beauty-crm/shared';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { newTempPassword } from '../common/utils/crypto.util';
import { AdminService } from '../modules/admin/admin.service';

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const admin = app.get(AdminService);
  try {
    switch (cmd) {
      case 'create-admin': {
        const [loginId, name] = args;
        if (!loginId || !name) throw new Error('사용법: create-admin <loginId> <이름>');
        const pw = newTempPassword();
        await admin.createAdmin(loginId, name, pw);
        console.log(`운영자 생성 완료\n  아이디: ${loginId}\n  임시 비밀번호: ${pw}`);
        break;
      }
      case 'list-shops': {
        const status = args[0] as ShopStatus | undefined;
        console.table(await admin.listShops(status));
        break;
      }
      case 'approve': {
        const id = Number(args[0]);
        if (!id) throw new Error('사용법: approve <shopId> [--founder]');
        console.log(await admin.setShopStatus(null, id, ShopStatus.ACTIVE, { founder: args.includes('--founder') }));
        break;
      }
      case 'suspend': {
        console.log(await admin.setShopStatus(null, Number(args[0]), ShopStatus.SUSPENDED));
        break;
      }
      case 'reset-owner-password': {
        console.log(await admin.resetOwnerPassword(Number(args[0])));
        break;
      }
      default:
        console.log('명령: create-admin | list-shops | approve | suspend | reset-owner-password');
    }
  } catch (e: any) {
    console.error('실패:', e?.response?.message ?? e?.message ?? e);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main();
