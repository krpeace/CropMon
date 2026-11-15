/**
 * 두 지점 사이의 거리순 정렬 (하버사인 거리, km).
 * 화면에서 "가까운 대신 볼 지점"을 고르는 안내용 정렬이며 농업 계산이 아니다 (결정 0044).
 */

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export type WithCoords = {
  id: number;
  lat: number;
  lon: number;
};

export type NearbyMatch<T extends WithCoords> = {
  item: T;
  km: number;
};

function haversineKm(a: WithCoords, b: WithCoords): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** origin 을 제외한 후보들 중 거리순으로 최대 n 곳을 돌려준다. */
export function nearestStations<T extends WithCoords>(
  origin: WithCoords,
  candidates: readonly T[],
  n: number,
): NearbyMatch<T>[] {
  if (n <= 0) return [];
  return candidates
    .filter((c) => c.id !== origin.id)
    .map((item) => ({ item, km: haversineKm(origin, item) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}
