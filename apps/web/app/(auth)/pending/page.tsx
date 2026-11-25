import Link from 'next/link';

export default function PendingPage() {
  return (
    <div>
      <h1>가입 신청이 접수되었습니다</h1>
      <p className="lead">
        확인 후 승인되면 바로 로그인할 수 있습니다. 보통 하루 안에 처리되며, 승인되면 연락드리겠습니다.
      </p>
      <Link href="/login" className="btn btn-primary btn-block">
        로그인 화면으로
      </Link>
    </div>
  );
}
