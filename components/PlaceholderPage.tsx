import { t } from "@/lib/i18n";

type Props = {
  title: string;
  /** В какой фазе разработки этот экран будет сделан по-настоящему. */
  phase: number;
  /** Необязательная строка, например ID из адреса. */
  detail?: string;
};

// Временная заглушка Фазы 0: каждая настоящая страница заменит её в своей фазе.
export function PlaceholderPage({ title, phase, detail }: Props) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col gap-2 p-5">
      <h1 className="text-3xl font-extrabold">{title}</h1>
      <p>{t("common.placeholder", { phase })}</p>
      {detail ? <p>{detail}</p> : null}
    </main>
  );
}
