import { Empty } from '../../../components/ui';

export default function Page() {
  return (
    <div className="page">
      <header className="page-head">
        <h1>녹음</h1>
      </header>
      <section className="card">
        <Empty title="준비 중입니다" desc="음성으로 시술 내용을 기록하는 기능은 3단계에서 만들어집니다." />
      </section>
    </div>
  );
}
