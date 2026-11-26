import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentController } from './payment.controller';
import { DailyClosing, Payment, PaymentDetail, PrepaidPass, PrepaidTransaction } from './payment.entities';
import { PaymentService } from './payment.service';
import { SettlementService } from './settlement.service';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, PaymentDetail, PrepaidPass, PrepaidTransaction, DailyClosing])],
  controllers: [PaymentController],
  providers: [PaymentService, SettlementService],
  exports: [PaymentService],
})
export class PaymentModule {}
