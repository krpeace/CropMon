/**
 * 지점 사전 (고정). DB `stations` 의 사전 자료(supabase/migrations/20261024010000_seed_dictionaries.sql)와
 * 번호·이름·순서가 같다. 주소창 읽기처럼 화면을 그리기 전에 바로 써야 해서 DB 를 묻지 않고 여기 둔다.
 * 같은지는 src/infra/supabase/seed.test.ts 가 검사한다. 지점을 바꾸면 사전 SQL 과 이 파일을 같은 PR 에서 고친다.
 */
export type StationEntry = {
  id: number;
  name: string;
  /** 일사(햇빛)를 재는 관측소인가 (태백은 재지 않음). */
  measuresSunlight: boolean;
};

export const STATIONS: readonly StationEntry[] = [
  { id: 101, name: "춘천", measuresSunlight: true },
  { id: 216, name: "태백", measuresSunlight: false },
  { id: 119, name: "수원", measuresSunlight: true },
  { id: 131, name: "청주", measuresSunlight: true },
  { id: 129, name: "서산", measuresSunlight: true },
  { id: 146, name: "전주", measuresSunlight: true },
  { id: 156, name: "광주", measuresSunlight: true },
  { id: 136, name: "안동", measuresSunlight: true },
  { id: 192, name: "진주", measuresSunlight: true },
  { id: 189, name: "서귀포", measuresSunlight: true },
];
