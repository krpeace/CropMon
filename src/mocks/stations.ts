import type { Crop } from "@/domain/selection";
import type { WaterStatus } from "@/domain/water-status";

/**
 * 예시 값. 시안(design/prototype) 기준일 2026년 8월 12일 화면에 나온 값을 옮겨 적었다.
 * 나중에 Supabase 조회로 바뀐다. 화면은 이 파일을 직접 읽지 않고 src/services 를 거친다.
 */
export type MockStation = {
  id: number;
  name: string;
  /** 일사(햇빛)를 재는 관측소인가. */
  measuresSunlight: boolean;
  /** 오늘 물 판정 (흙은 양토 기준). */
  todayStatus: Record<Crop, WaterStatus>;
};

export const MOCK_STATIONS: readonly MockStation[] = [
  {
    id: 101,
    name: "춘천",
    measuresSunlight: true,
    todayStatus: { apple: "caution", cabbage: "caution" },
  },
  {
    id: 216,
    name: "태백",
    measuresSunlight: false,
    todayStatus: { apple: "normal", cabbage: "normal" },
  },
  {
    id: 119,
    name: "수원",
    measuresSunlight: true,
    todayStatus: { apple: "need", cabbage: "need" },
  },
  {
    id: 131,
    name: "청주",
    measuresSunlight: true,
    todayStatus: { apple: "need", cabbage: "caution" },
  },
  {
    id: 129,
    name: "서산",
    measuresSunlight: true,
    todayStatus: { apple: "caution", cabbage: "caution" },
  },
  {
    id: 146,
    name: "전주",
    measuresSunlight: true,
    todayStatus: { apple: "wet", cabbage: "wet" },
  },
  {
    id: 156,
    name: "광주",
    measuresSunlight: true,
    todayStatus: { apple: "caution", cabbage: "caution" },
  },
  {
    id: 136,
    name: "안동",
    measuresSunlight: true,
    todayStatus: { apple: "need", cabbage: "need" },
  },
  {
    id: 192,
    name: "진주",
    measuresSunlight: true,
    todayStatus: { apple: "caution", cabbage: "caution" },
  },
  {
    id: 189,
    name: "서귀포",
    measuresSunlight: true,
    todayStatus: { apple: "normal", cabbage: "normal" },
  },
];
