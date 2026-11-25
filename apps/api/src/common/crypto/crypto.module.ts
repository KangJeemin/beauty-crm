import { Global, Module } from '@nestjs/common';
import { PhoneCipher } from './phone-cipher.service';

@Global()
@Module({ providers: [PhoneCipher], exports: [PhoneCipher] })
export class CryptoModule {}
