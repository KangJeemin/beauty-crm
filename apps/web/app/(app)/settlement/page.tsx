import { Empty } from '../../../components/ui';

export default function Page() {
  return (
    <div className="page">
      <header className="page-head">
        <h1>정산</h1>
      </header>
      <section className="card">
        <Empty title="준비 중입니다" desc="결제 기록과 일·월 정산은 4단계에서 만들어집니다." />
      </section>
    </div>
  );
}
