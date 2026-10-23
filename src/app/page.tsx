import { Suspense } from "react";

import packageJson from "../../package.json";
import { DbStatus } from "./db-status";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-10 sm:max-w-2xl">
      <h1 className="text-2xl leading-snug font-bold sm:text-3xl">CropMon</h1>
      <p className="mt-3 text-lg text-gray-600 dark:text-gray-400">
        농업 데이터와 내 농장 기록으로 작물 재배 판단을 돕는 서비스
      </p>
      <p className="mt-2 text-gray-500">준비 중</p>
      <footer className="mt-auto space-y-2 pt-10 text-sm">
        <Suspense
          fallback={
            <p className="text-gray-500">데이터베이스 연결: 확인 중…</p>
          }
        >
          <DbStatus />
        </Suspense>
        <p className="text-gray-500">버전 {packageJson.version}</p>
      </footer>
    </main>
  );
}
