# Вспомогательный скрипт: вливает JSON-фрагмент в locales/ru.json (глубокое слияние, порядок сохраняется).
import json, sys

def merge(dst, src):
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            merge(dst[k], v)
        else:
            dst[k] = v

path = "locales/ru.json"
with open(path, encoding="utf-8") as f:
    data = json.load(f)
with open(sys.argv[1], encoding="utf-8") as f:
    merge(data, json.load(f))
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
