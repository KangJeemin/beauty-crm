import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiUsageLog } from './ai-usage-log.entity';
import { AiUsageService } from './ai-usage.service';
import { AudioTranscoder } from './audio-transcoder';
import { ClovaSttProvider } from './providers/clova-stt.provider';
import { HyperClovaLlmProvider } from './providers/hyperclova-llm.provider';
import { MockLlmProvider, MockSttProvider } from './providers/mock.providers';
import { LLM_PROVIDER, LlmProvider, STT_PROVIDER, SttProvider } from './providers/provider.types';

/**
 * .env 로 엔진 선택 — 코드 수정 없이 교체
 *   STT_PROVIDER = CLOVA | MOCK
 *   LLM_PROVIDER = HYPERCLOVA | MOCK
 */
@Module({
  imports: [TypeOrmModule.forFeature([AiUsageLog])],
  providers: [
    AudioTranscoder,
    AiUsageService,
    {
      provide: STT_PROVIDER,
      inject: [ConfigService],
      useFactory: (c: ConfigService): SttProvider => {
        const code = c.get('STT_PROVIDER', 'MOCK');
        Logger.log(`STT 엔진: ${code}`, 'AiModule');
        if (code === 'CLOVA') return new ClovaSttProvider(c.getOrThrow('CLOVA_SPEECH_INVOKE_URL'), c.getOrThrow('CLOVA_SPEECH_SECRET_KEY'));
        return new MockSttProvider();
      },
    },
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (c: ConfigService): LlmProvider => {
        const code = c.get('LLM_PROVIDER', 'MOCK');
        Logger.log(`LLM 엔진: ${code} (${c.get('LLM_MODEL', 'HCX-007')})`, 'AiModule');
        if (code === 'HYPERCLOVA') {
          return new HyperClovaLlmProvider(
            c.getOrThrow('CLOVA_STUDIO_API_KEY'),
            c.get('LLM_MODEL', 'HCX-007'),
            c.get('CLOVA_STUDIO_BASE_URL', 'https://clovastudio.stream.ntruss.com'),
          );
        }
        return new MockLlmProvider();
      },
    },
  ],
  exports: [STT_PROVIDER, LLM_PROVIDER, AudioTranscoder, AiUsageService],
})
export class AiModule {}
