# docs/data

외부 저장소(`croplib-dp`)에서 가져온 사전 데이터 및 참조 파일입니다.
값을 수동으로 편집하지 않고, 원본 파일의 내용과 체크섬을 그대로 보존합니다.

## 파일 목록

### `stations_grid_20261108.csv`

- **출처**: `krpeace/croplib-dp` 저장소 `docs/data/stations_grid_20261108.csv`
- **기준 커밋**: `2038b4b8606c9617852e7b4e7184248387de9159` (PR #75, 결정 0025)
- **가져온 날짜**: 2026-11-08
- **SHA-256**: `4e4e5f918d024b4a1412e8f64c50cbbcf03c3a45ef05c1fc9c389c93cb9fd624` (저장소에 저장된 LF 기준, Windows CRLF 체크아웃에서는 값이 다르게 나옴)
- **내용**: 기상청 ASOS 현행 운영 지점 97곳의 단기예보 격자(`grid_nx`, `grid_ny`) 및 반올림 경계 근접 여부(`near_boundary`). 계산 방식은 `kma_lcc_5km_v1`(Lambert 정각원추).

## 마이그레이션 SQL 생성

이 CSV로부터 Supabase 마이그레이션 SQL(`supabase/migrations/20261108020000_seed_stations_forecast_grid.sql`)을 생성하려면 아래 명령을 실행합니다:

```bash
python scripts/generate_migration.py
```

- CSV의 97곳 지점 격자값을 읽어 SQL의 `values` 목록을 생성합니다.
- 이미 값이 채워진 대표 10곳을 덮어쓰지 않도록 `where s.stn_id = v.stn_id and s.grid_nx is null` 조건이 붙습니다.
- 자동 검사(`src/infra/supabase/seed.test.ts`)가 CSV와 생성된 마이그레이션의 97곳 값이 일치하는지 검사합니다.
