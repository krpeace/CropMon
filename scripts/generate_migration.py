"""docs/data/stations_grid_20261108.csv 에서 supabase/migrations/20261108020000_seed_stations_forecast_grid.sql 을 생성한다.

실행 방법:
  python scripts/generate_migration.py
"""

import csv
from pathlib import Path


def generate() -> None:
    root = Path(__file__).resolve().parent.parent
    csv_path = root / "docs" / "data" / "stations_grid_20261108.csv"
    out_path = (
        root
        / "supabase"
        / "migrations"
        / "20261108020000_seed_stations_forecast_grid.sql"
    )

    if not csv_path.exists():
        raise FileNotFoundError(f"CSV 파일을 찾을 수 없습니다: {csv_path}")

    with open(csv_path, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    if len(rows) != 97:
        raise ValueError(
            f"운영 지점 수가 97곳이어야 하는데 {len(rows)}곳입니다."
        )

    # stn_id 기준 정수 오름차순 정렬 (90 속초부터 296 북부산까지)
    rows.sort(key=lambda r: int(r["stn_id"]))

    val_lines = []
    for i, r in enumerate(rows):
        comma = "," if i < len(rows) - 1 else ""
        val_lines.append(
            f"    ('{r['stn_id']}', {r['grid_nx']}, {r['grid_ny']}){comma} -- {r['name_ko']}"
        )

    sql_content = f"""-- 목적: 운영 97곳 지점 예보 격자(grid_nx, grid_ny) 시드 (croplib-dp 결정 0025, PR #75, #28 C3).
--       입력: docs/data/stations_grid_20261108.csv (croplib-dp 커밋 2038b4b, Lambert 정각원추 kma_lcc_5km_v1).
--       빈 칸만 채우고, 이미 값이 채워진 대표 10곳은 덮어쓰지 않는다 (where s.grid_nx is null).
--       has_forecast 는 바꾸지 않는다 (예보 확대는 croplib-dp S4에서 20곳씩).
--
-- 실행 방법:
--   1. Supabase 대시보드 → SQL Editor 에 이 파일 내용을 붙여 넣고 Run 을 누른다.
--   2. 여러 번 실행해도 오류가 나지 않는다.
--
-- 자동 검사: src/infra/supabase/seed.test.ts 가 docs/data/stations_grid_20261108.csv 와의 97곳 값 일치를 검사한다.

update public.stations as s
set
  grid_nx = v.grid_nx,
  grid_ny = v.grid_ny
from (
  values
{chr(10).join(val_lines)}
) as v(stn_id, grid_nx, grid_ny)
where s.stn_id = v.stn_id
  and s.grid_nx is null;
"""

    out_path.write_text(sql_content, encoding="utf-8")
    print(f"생성 완료: {out_path} (지점 {len(rows)}곳)")


if __name__ == "__main__":
    generate()
