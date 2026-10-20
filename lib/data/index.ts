import { DexieRepository } from "./dexieRepository";
import type { Repository } from "./repository";

let instance: Repository | null = null;

/** Репозиторий-одиночка для браузера. Вызывать только на клиенте (в эффектах и обработчиках). */
export function getRepository(): Repository {
  instance ??= new DexieRepository();
  return instance;
}

/** Подмена репозитория (тесты). */
export function setRepository(repo: Repository | null): void {
  instance = repo;
}

export type { Repository } from "./repository";
export * from "./types";
