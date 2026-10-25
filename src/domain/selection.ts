/** 화면에서 고를 수 있는 작물. 주소창에는 영문 값으로 남는다. */
export const CROPS = ["apple", "cabbage"] as const;
export type Crop = (typeof CROPS)[number];

export const CROP_LABEL: Record<Crop, string> = {
  apple: "사과",
  cabbage: "배추",
};

/**
 * 지역(관측 지점)과 작물. 주소창 ?st=101&crop=apple 로 모든 메뉴에 이어진다.
 * kc 는 재배 방식 번호(FAO-56 Table 12 순서, DB crop_kc_sets.set_no). 고르지 않았으면 없다(기본 재배 방식).
 */
export type Selection = { stationId: number; crop: Crop; kc?: number };

type QueryValue = string | string[] | undefined;
type Query = URLSearchParams | Record<string, QueryValue>;

function first(query: Query, key: string): string | undefined {
  if (query instanceof URLSearchParams) return query.get(key) ?? undefined;
  const value = query[key];
  return Array.isArray(value) ? value[0] : value;
}

function isCrop(value: string | undefined): value is Crop {
  return CROPS.some((crop) => crop === value);
}

/** 주소창 값을 읽는다. 없거나 잘못된 값이면 첫 지점과 사과로 돌린다. */
export function parseSelection(
  query: Query,
  stationIds: readonly number[],
): Selection {
  const st = Number(first(query, "st"));
  const crop = first(query, "crop");
  const kc = Number(first(query, "kc"));
  return {
    stationId: stationIds.includes(st) ? st : stationIds[0],
    crop: isCrop(crop) ? crop : CROPS[0],
    ...(Number.isInteger(kc) && kc >= 1 ? { kc } : {}),
  };
}

/** 주소 뒤에 선택값을 붙인다. 선택값을 아직 모르면 주소만 돌려준다. */
export function withSelection(path: string, selection: Selection | null) {
  if (!selection) return path;
  const kc = selection.kc ? `&kc=${selection.kc}` : "";
  return `${path}?st=${selection.stationId}&crop=${selection.crop}${kc}`;
}

/** 자동 전환 순서: 사과로 모든 지점 → 배추로 모든 지점 → 처음으로. */
function rotationIndex(selection: Selection, stationIds: readonly number[]) {
  const station = Math.max(0, stationIds.indexOf(selection.stationId));
  return CROPS.indexOf(selection.crop) * stationIds.length + station;
}

export function rotationPosition(
  selection: Selection,
  stationIds: readonly number[],
) {
  return rotationIndex(selection, stationIds) + 1;
}

export function nextInRotation(
  selection: Selection,
  stationIds: readonly number[],
): Selection {
  const total = CROPS.length * stationIds.length;
  const next = (rotationIndex(selection, stationIds) + 1) % total;
  return {
    stationId: stationIds[next % stationIds.length],
    crop: CROPS[Math.floor(next / stationIds.length)],
  };
}
