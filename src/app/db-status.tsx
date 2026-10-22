import { connection } from "next/server";

import { formatKoreanDateTime } from "@/domain/datetime";
import { getHealthStatus } from "@/services/health";

/** 데이터베이스 연결 상태. 요청이 올 때마다 확인하고, 실패해도 화면은 뜬다. */
export async function DbStatus() {
  await connection();
  const status = await getHealthStatus();

  return (
    <div>
      <p>
        데이터베이스 연결:{" "}
        <strong
          className={
            status.ok
              ? "text-green-700 dark:text-green-400"
              : "text-red-700 dark:text-red-400"
          }
        >
          {status.ok ? "정상" : "확인 필요"}
        </strong>
      </p>
      <p className="text-gray-500">
        확인 시각: {formatKoreanDateTime(status.checkedAt)}
      </p>
    </div>
  );
}
