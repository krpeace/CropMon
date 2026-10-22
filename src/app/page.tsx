import packageJson from "../../package.json";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-10 sm:max-w-2xl">
      <h1 className="text-2xl leading-snug font-bold sm:text-3xl">
        cropwater — 노지 작물 물수지
      </h1>
      <p className="mt-3 text-lg text-gray-600 dark:text-gray-400">준비 중</p>
      <footer className="mt-auto pt-10 text-sm text-gray-500">
        버전 {packageJson.version}
      </footer>
    </main>
  );
}
