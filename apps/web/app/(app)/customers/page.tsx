import { Empty } from '../../../components/ui';

export default function Page() {
  return (
    <div className="page">
      <header className="page-head">
        <h1>고객</h1>
      </header>
      <section className="card">
        <Empty title="준비 중입니다" desc="고객 등록과 전화번호 뒷자리 검색은 2단계에서 만들어집니다." />
      </section>
    </div>
  );
}
