-- 작물 공통 적산온도 단계 늘리기 (결정 0032)
-- 여러 번 실행해도 같은 결과.
update public.crops
   set gdd_stages = '{500,1000,1500,2000,2500,3000}'
 where crop_id = 'common';
