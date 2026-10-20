"use client";

import { useEffect, useRef, useState } from "react";
import { getRepository } from "./index";
import type { Repository } from "./repository";

/**
 * Читает данные из репозитория и сам обновляется при любой записи.
 * Пока данные грузятся, `data` равен undefined.
 */
export function useRepoData<T>(
  fetcher: (repo: Repository) => Promise<T>,
  deps: readonly unknown[] = [],
): { data: T | undefined; loading: boolean } {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);

  // Хранит свежую функцию загрузки, не пересоздавая подписку при каждом рендере.
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    const repo = getRepository();
    let cancelled = false;
    let seq = 0;

    const run = () => {
      const mine = ++seq;
      fetcherRef
        .current(repo)
        .then((value) => {
          // Берём только самый свежий ответ — старые запросы могли закончиться позже.
          if (!cancelled && mine === seq) {
            setData(value);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled && mine === seq) setLoading(false);
        });
    };

    run();
    const unsubscribe = repo.subscribe(run);
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading };
}
