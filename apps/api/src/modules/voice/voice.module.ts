import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { Customer } from '../customer/entities/customer.entity';
import { ServiceCategory, ServiceMenu } from '../menu/entities/menu.entity';
import { VoiceRecord } from './voice-record.entity';
import { VoiceController } from './voice.controller';
import { VoiceProcessor } from './voice.processor';
import { VoiceRepository, VoiceService } from './voice.service';

@Module({
  imports: [TypeOrmModule.forFeature([VoiceRecord, Customer, ServiceMenu, ServiceCategory]), AiModule],
  controllers: [VoiceController],
  providers: [VoiceRepository, VoiceService, VoiceProcessor],
  exports: [VoiceProcessor],
})
export class VoiceModule {}
