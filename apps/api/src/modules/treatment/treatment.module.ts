import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Treatment, TreatmentItemEntity, TreatmentRecipeEntity } from './entities/treatment.entity';
import { TreatmentController } from './treatment.controller';
import { TreatmentRepository, TreatmentService } from './treatment.service';

@Module({
  imports: [TypeOrmModule.forFeature([Treatment, TreatmentItemEntity, TreatmentRecipeEntity])],
  controllers: [TreatmentController],
  providers: [TreatmentRepository, TreatmentService],
  exports: [TreatmentService],
})
export class TreatmentModule {}
