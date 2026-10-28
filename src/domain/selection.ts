/** 화면에서 고를 수 있는 작물. 주소창에는 영문 값으로 남는다 (기본값: common 작물 공통). */
export const CROPS = ["common", "apple", "cabbage"] as const;
export type Crop = (typeof CROPS)[number];

export const CROP_LABEL: Record<Crop, string> = {
  common: "작물 공통",
  apple: "사과",
  cabbage: "배추",
};

/** 작물 공통에서 고를 수 있는 토성 12종 (DB soil_types.sort_order 순). */
export const SOIL_CODES = [
  "sand",
  "loamy_sand",
  "sandy_loam",
  "sandy_clay_loam",
  "loam",
  "silt_loam",
  "silt",
  "clay_loam",
  "silty_clay_loam",
  "sandy_clay",
  "silty_clay",
  "clay",
] as const;
export type SoilCode = (typeof SOIL_CODES)[number];

export const DEFAULT_SOIL: SoilCode = "loam";

export const SOIL_LABEL: Record<SoilCode, string> = {
  sand: "사토",
  loamy_sand: "양질사토",
  sandy_loam: "사양토",
  sandy_clay_loam: "사질식양토",
  loam: "양토",
  silt_loam: "미사질양토",
  silt: "미사토",
  clay_loam: "식양토",
  silty_clay_loam: "미사질식양토",
  sandy_clay: "사질식토",
  silty_clay: "미사질식토",
  clay: "식토",
};

/**
 * 지역 고르기와 주소창 읽기에 쓰는 지점 사전 항목.
 * DB `stations` (계약 v1.6) 및 `src/infra/stations.ts` 의 항목 모양과 맞춘다.
 */
export type StationOption = {
  id: number;
  name: string;
  sido: string;
  isRepresentative: boolean;
  isActive: boolean;
};

/**
 * 지역(관측 지점)과 작물. 주소창 ?st=101&crop=common 로 모든 메뉴에 이어진다.
 * kc 는 재배 방식 번호(사과·배추에서만, DB crop_kc_sets.set_no).
 * soil 은 토성 코드(작물 공통에서만, 기본은 양토 loam).
 */
export type Selection = {
  stationId: number;
  crop: Crop;
  kc?: number;
  soil?: SoilCode;
};

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

export function isSoilCode(value: string | undefined): value is SoilCode {
  return SOIL_CODES.some((code) => code === value);
}

function activeAndDefaultIds(stations: readonly (number | StationOption)[]): {
  activeIds: number[];
  defaultId: number;
} {
  const activeIds: number[] = [];
  let defaultId: number | undefined;
  for (const s of stations) {
    if (typeof s === "number") {
      activeIds.push(s);
      if (defaultId === undefined) defaultId = s;
    } else if (s.isActive) {
      activeIds.push(s.id);
      if (defaultId === undefined && s.isRepresentative) defaultId = s.id;
    }
  }
  return {
    activeIds,
    defaultId: defaultId ?? activeIds[0] ?? 101,
  };
}

/**
 * 주소창 값을 읽는다. 대표 밖 운영 지점(isActive=true)도 그대로 읽고,
 * 사전에 없거나 폐지된 지점(isActive=false)이면 기본 지점(춘천 101)과 작물 공통(양토)으로 돌린다.
 */
export function parseSelection(
  query: Query,
  stations: readonly (number | StationOption)[],
): Selection {
  const st = Number(first(query, "st"));
  const rawCrop = first(query, "crop");
  const crop: Crop = isCrop(rawCrop) ? rawCrop : CROPS[0];
  const kc = Number(first(query, "kc"));
  const rawSoil = first(query, "soil");
  const { activeIds, defaultId } = activeAndDefaultIds(stations);
  return {
    stationId: activeIds.includes(st) ? st : defaultId,
    crop,
    ...(crop === "common"
      ? { soil: isSoilCode(rawSoil) ? rawSoil : DEFAULT_SOIL }
      : Number.isInteger(kc) && kc >= 1
        ? { kc }
        : {}),
  };
}

/** 주소 뒤에 선택값을 붙인다. 선택값을 아직 모르면 주소만 돌려준다. */
export function withSelection(path: string, selection: Selection | null) {
  if (!selection) return path;
  const kc =
    selection.crop !== "common" && selection.kc ? `&kc=${selection.kc}` : "";
  const soil =
    selection.crop === "common" &&
    selection.soil &&
    selection.soil !== DEFAULT_SOIL
      ? `&soil=${selection.soil}`
      : "";
  return `${path}?st=${selection.stationId}&crop=${selection.crop}${kc}${soil}`;
}

/** 마지막 글자의 받침 유무에 따라 보조사 "은"(받침 있음) 또는 "는"(받침 없음)을 돌려준다. */
export function topicParticle(word: string): "은" | "는" {
  const trimmed = word.trim();
  if (!trimmed) return "는";
  const code = trimmed.charCodeAt(trimmed.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? "은" : "는";
}

/** 종합 화면 첫 질문: 작물 공통이면 "오늘 {지점}은/는 어떤가요?", 작물이면 "오늘 {지점} {작물}은/는 어떤가요?". */
export function homeQuestion(stationName: string, crop: Crop): string {
  if (crop === "common") {
    return `오늘 ${stationName}${topicParticle(stationName)} 어떤가요?`;
  }
  const cropName = CROP_LABEL[crop];
  return `오늘 ${stationName} ${cropName}${topicParticle(cropName)} 어떤가요?`;
}

/** 대표 10곳 안이면 1부터 순번을 돌려주고, 대표 지점 밖이면 null 이다. */
export function rotationPosition(
  selection: Selection,
  stationIds: readonly number[],
): number | null {
  const idx = stationIds.indexOf(selection.stationId);
  return idx < 0 ? null : idx + 1;
}

/** 자동 전환 순서: 고른 작물·토양·재배 방식은 그대로 두고 대표 지점만 차례로 돈다. */
export function nextInRotation(
  selection: Selection,
  stationIds: readonly number[],
): Selection {
  const idx = stationIds.indexOf(selection.stationId);
  const nextIdx = idx < 0 ? 0 : (idx + 1) % stationIds.length;
  return {
    ...selection,
    stationId: stationIds[nextIdx],
  };
}

/** 한글 가나다순(localeCompare('ko'))으로 정렬하고, 이름이 같으면 지점 번호 오름차순으로 정렬한다. */
export function sortStationsKo<T extends { id: number; name: string }>(
  stations: readonly T[],
): T[] {
  return [...stations].sort(
    (a, b) => a.name.localeCompare(b.name, "ko") || a.id - b.id,
  );
}

/**
 * 운영 중인 지점(isActive=true)만 가나다순으로 정렬한 뒤,
 * 검색어가 있으면 지점 이름 포함 · 지점 번호 앞자리 · 시·도 포함으로 거른다.
 */
export function filterStations<T extends StationOption>(
  stations: readonly T[],
  query: string,
): T[] {
  const active = sortStationsKo(stations.filter((s) => s.isActive));
  const q = query.trim();
  if (!q) return active;
  return active.filter(
    (s) =>
      s.name.includes(q) || String(s.id).startsWith(q) || s.sido.includes(q),
  );
}

export type RegionSection<T> = {
  label: string;
  items: T[];
};

export type RegionSectionsResult<T> = {
  query: string;
  totalActive: number;
  isEmpty: boolean;
  sections: RegionSection<T>[];
};

/**
 * 지역 고르기 목록 묶음:
 * - 검색어가 없을 때: "대표 지점 N곳"(대표 순서) + "전체 ASOS 지점 N곳 · 가나다순"
 * - 검색어가 있을 때: "검색 결과 N곳"
 */
export function buildRegionSections<T extends StationOption>(
  stations: readonly T[],
  query: string,
): RegionSectionsResult<T> {
  const active = stations.filter((s) => s.isActive);
  const rep = active.filter((s) => s.isRepresentative);
  const all = sortStationsKo(active);
  const q = query.trim();
  if (!q) {
    return {
      query: q,
      totalActive: all.length,
      isEmpty: false,
      sections: [
        { label: `대표 지점 ${rep.length}곳`, items: rep },
        { label: `전체 ASOS 지점 ${all.length}곳 · 가나다순`, items: all },
      ],
    };
  }
  const matched = filterStations(active, q);
  return {
    query: q,
    totalActive: all.length,
    isEmpty: matched.length === 0,
    sections: [{ label: `검색 결과 ${matched.length}곳`, items: matched }],
  };
}

/** 사전의 measures_sunlight 열 표시: 거짓이면 "관측 안 함", 빈 칸(null)이면 "확인 안 됨", 참이면 "관측함". */
export function sunlightStatusLabel(
  measuresSunlight: boolean | null,
): "관측함" | "관측 안 함" | "확인 안 됨" {
  if (measuresSunlight === false) return "관측 안 함";
  if (measuresSunlight === null) return "확인 안 됨";
  return "관측함";
}
