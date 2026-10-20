import { t } from "@/lib/i18n";

type Props = {
  title: string;
  /** В какой фазе разработки этот экран будет сделан по-настоящему. */
  phase: number;
  /** Необязательная строка, например ID из адреса. */
  detail?: string;
};

// Временная заглушка: каждая настоящая страница заменит её в своём этапе.
export function PlaceholderPage({ title, phase, detail }: Props) {
  return (
    <main className="flex flex-col gap-2 p-5">
      <h1 className="font-display text-[30px] leading-tight font-extrabold tracking-[-0.02em]">
        {title}
      </h1>
      <p>{t("common.placeholder", { phase })}</p>
      {detail ? <p>{detail}</p> : null}
    </main>
  );
}
