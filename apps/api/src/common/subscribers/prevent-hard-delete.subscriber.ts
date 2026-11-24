import { EntitySubscriberInterface, EventSubscriber, RemoveEvent } from 'typeorm';

/** 로그 테이블 외에는 물리 삭제를 허용하지 않는다. */
const HARD_DELETE_ALLOWED = new Set(['refresh_token']);

/**
 * repository.remove() / manager.remove() 로 물리 삭제하려 하면 막는다.
 * (repository.delete() / QueryBuilder.delete() 는 이벤트가 없어 여기서 못 막는다
 *  → 코드 리뷰 규칙: delete 사용 금지, BaseRepository.softDeleteById 사용)
 */
@EventSubscriber()
export class PreventHardDeleteSubscriber implements EntitySubscriberInterface {
  beforeRemove(event: RemoveEvent<any>): void {
    const table = event.metadata.tableName;
    if (!HARD_DELETE_ALLOWED.has(table)) {
      throw new Error(`[${table}] 물리 삭제 금지 — delState 로 소프트 삭제하세요.`);
    }
  }
}
