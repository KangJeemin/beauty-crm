import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagModule } from '../tag/tag.module';
import { CustomerController } from './customer.controller';
import { CustomerRepository, CustomerService } from './customer.service';
import { Customer } from './entities/customer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer]), TagModule],
  controllers: [CustomerController],
  providers: [CustomerRepository, CustomerService],
  exports: [CustomerRepository],
})
export class CustomerModule {}
