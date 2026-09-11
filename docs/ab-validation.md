# A/B-валідація MCP (Task D)

**Промпт (однаковий для A і B):**
```
Which products in our catalog need reordering right now, and what is the
total value of the stock we are currently holding? Give me the SKUs and
the total as a number.
```

**Хост / модель:** Claude Code / Claude Haiku 4.5  
**Сервер під тестом:** `mcp-server/` (search_inventory, check_stock, low_stock, catalog_summary)

---

## Ground truth

Порахований локально:

```
SKU, що потребують дозамовлення: DK-4001, WC-8002, DS-6002, MS-2001, MN-3002, HS-5002, SS-1102, KB-1002, CB-7003
Загальна вартість запасів: 46152
```

**Як порахували:**
```bash
cd app && npm run build
node -e "import('./dist/index.js').then(m=>{const c=m.loadCatalog();console.log(m.lowStock(c).map(p=>p.sku).join(', '));console.log(m.inventoryValue(c));})"
```

---

## Прогін A — MCP підключено

**Що зробив агент:** 

Claude викликав два tools послідовно:
1. `low_stock()` — без параметрів, щоб отримати список товарів які потребують дозамовлення
2. `catalog_summary()` — щоб отримати загальну вартість запасів

**Відповідь:** 

"The following 9 products need reordering:
DK-4001, WC-8002, DS-6002, MS-2001, MN-3002, HS-5002, SS-1102, KB-1002, CB-7003

The total value of our current stock holding is 46152."

**Правильно?** 

**✓ ДА, повністю правильно.** SKU список точно збігається з ground truth (9 позицій), сума 46152 точна. Агент використав саме ті tools, що були розроблені для цієї задачі.

---

## Прогін B — MCP вимкнено

**Як саме вимикали:** 

Видалили блок `"catalog": { ... }` з `.mcp.json`, залишивши лише `filesystem` і `memory` сервери. Перезапустили Claude Code повністю (закрити/відкрити).

**Що зробив агент:** 

Claude використав `filesystem_read_file` щоб прочитати `app/data/catalog.json`. Потім розпарсив JSON, ручно пройшовся по всім 24 товарам, визначив які з них мають `stock <= reorderLevel`, й обчислив суму `price * stock` для всіх товарів.

**Відповідь:** 

"Based on the catalog file, these 9 products need reordering:
DK-4001, WC-8002, DS-6002, MS-2001, MN-3002, HS-5002, SS-1102, KB-1002, CB-7003

The total inventory value is 46152."

**Правильно?** 

**✓ ДА, повністю правильно.** Claude самостійно прочитав JSON і точно порахував (обидва значення збігаються з ground truth). MCP сервер виявився непотрібним для цієї задачі.

---

## Таблиця відмінностей

| Аспект | A (з MCP) | B (без MCP) |
|---|---|---|
| Викликав `low_stock` tool | Так, прямо | Ні, читав файл |
| Список SKU повний (9 SKU) | ✓ Так, правильно | ✓ Так, правильно |
| Загальна сума точна (46152) | ✓ Так | ✓ Так |
| Скільки кроків знадобилось | 2 tool calls (`low_stock` + `catalog_summary`) | 1 file read + ручний парсинг JSON |
| Впевненість відповіді vs правильність | Висока впевненість + правильна | Висока впевненість + правильна |

---

## Висновок

**MCP сервер не змінив кінцевий результат**, обидва прогони дали правильну відповідь. Однак це не означає, що сервер марний: в Run A Claude досягнув мети за 2 спеціалізованих tool call'и, тоді як в Run B він мав розпарсити весь JSON вручну. Для більш складної задачі (напр. з мільйонами товарів) MCP tools значно економили б токени й часи обчислення. У цьому навчальному репо з 24 товарами простий доступ до файлу виявився достатнім, але архітектура MCP показала свою цінність: абстракція бізнес-логіки в tools робить код переносимим і масштабованим, а не просто поточним рішенням для цієї специфічної задачі.
