import { Empty } from '../../../components/ui';

/** 태블릿·PC 의 오른쪽 칸 (휴대폰에서는 보이지 않음) */
export default function CustomersIndex() {
  return (
    <div className="card split-placeholder">
      <Empty title="고객을 선택해 주세요" desc="왼쪽에서 고객을 고르면 정보와 시술 기록이 여기에 보입니다." />
    </div>
  );
}
