# MCP-сервери проєкту (Task A)

**Хост(и), у якому налаштовано:** Claude Code  
**Файл конфігурації:** `.mcp.json` (корінь репо) + `.claude/settings.json` (deny-правила для write-tools)

**Як запускаються всі три сервери.** Кожен запис у `.mcp.json` — це
`sh -c 'cd "$CLAUDE_PROJECT_DIR" 2>/dev/null; exec …'`. Claude Code кладе
`CLAUDE_PROJECT_DIR` у середовище процесу сервера (але не в своє, тому
`${CLAUDE_PROJECT_DIR}` у `args` не розгорнувся б). `$CLAUDE_PROJECT_DIR` без
дужок Claude Code не чіпає, його розгортає `sh` уже під час запуску. Тож
відносні шляхи (`./app/data`, `./mcp-server/dist/server.js`) завжди рахуються
від кореня репо, а не від робочого каталогу хоста. Якщо змінної немає (інший
хост), `cd` мовчки пропускається і шляхи рахуються від cwd. Обмеження: потрібен
POSIX `sh` (macOS/Linux; на Windows — Git Bash/WSL).

Перевірено: усі три сервери запущені з `cwd=/tmp` з виставленим
`CLAUDE_PROJECT_DIR` коректно відповідають на `tools/call`.

---

## Сервер 1 — filesystem

| | |
|---|---|
| **Навіщо** | Читати файли каталогу (`app/data/catalog.json`) без ручного копіювання даних агенту |
| **Транспорт** | stdio |
| **Як запускається** | `npx -y @modelcontextprotocol/server-filesystem ./app/data` (через `sh -c`, див. вище) |
| **Область доступу (scope)** | **Заявлена:** `./app/data`. **Фактична в Claude Code:** корінь репо — див. «Що побачили насправді» нижче |
| **Секрети** | немає |
| **Версія** | плаваюча (latest `@modelcontextprotocol/server-filesystem`) — прийнятий ризик, див. `SECURITY.md` |

**Які tools він дає агенту** (фактичний список у Claude Code):

- читання: `read_text_file`, `read_file`, `read_media_file`, `read_multiple_files`,
  `list_directory`, `list_directory_with_sizes`, `directory_tree`, `search_files`,
  `get_file_info`, `list_allowed_directories`
- **запис:** `write_file`, `edit_file`, `create_directory`, `move_file`

Сам сервер **не має режиму read-only**: шлях в аргументі обмежує лише *де*
можна писати, а не *чи* можна. Тому write-tools заблоковані на рівні хоста —
`permissions.deny` у `.claude/settings.json`. Перевірено: виклик
`mcp__filesystem__write_file` повертає `Permission to use
mcp__filesystem__write_file has been denied.`, після чого Claude Code прибирає
write-tools із сесії. Це межа *хоста Claude Code*: у Cursor/VS Code з тим самим
`.mcp.json` write-tools будуть доступні.

**Перевірка, що працює:** `list_allowed_directories` і читання
`app/data/catalog.json` через `read_text_file` — працюють. ✓

### Що побачили насправді (roots)

- У stderr сервера (`~/Library/Caches/claude-cli-nodejs/<project>/mcp-logs-filesystem/`)
  **немає** рядка `Client does not support MCP Roots, using allowed directories
  set from server args`. Натомість у лозі хоста: `Received ListRoots request from server`.
- `list_allowed_directories` у Claude Code повертає
  **`/Users/vlad/Projects/rbi_ai_training/hw/2026-udc-06-mcp-hw`** — увесь репо,
  а не `app/data`.
- Причина: Claude Code підтримує `roots` і відповідає на `roots/list`
  каталогом запуску сесії (+ каталоги з `--add-dir`). Filesystem-сервер
  **замінює** ними аргументи командного рядка; вимкнути це прапорцем не можна
  (перевірено у `server.js` пакета).
- Для контролю: той самий сервер, запущений вручну по stdio клієнтом без
  `roots`, повертає `.../app/data`. Тобто `./app/data` — лише запасний варіант
  для хостів без roots.

**Висновок:** реальний scope визначає хост, а не наш аргумент. Корінь репо
відповідає вимозі завдання («шлях до цього репозиторію, а не домашня тека і
не `/`»), але він ширший, ніж ми задумали. Агент може читати весь репо, зокрема
`.env`, якщо той з'явиться. `roots` — механізм координації, а не безпеки.
Справжньої межі на рівні ОС (окремий користувач, пісочниця) тут немає — це
прийнятий ризик, див. `SECURITY.md`.

---

## Сервер 2 — memory

| | |
|---|---|
| **Навіщо** | Knowledge graph для нотаток агента між кроками (сутності/спостереження, напр. «SKU X треба дозамовити») |
| **Транспорт** | stdio |
| **Як запускається** | `MEMORY_FILE_PATH=<корінь репо>/.mcp-memory.jsonl npx -y @modelcontextprotocol/server-memory` (через `sh -c`) |
| **Область доступу (scope)** | один файл `.mcp-memory.jsonl` у корені репо (у `.gitignore`) |
| **Секрети** | немає |
| **Версія** | плаваюча |

**Це не «пам'ять сесії».** Сервер зберігає граф у JSONL-файлі, і дані
**переживають перезапуск** хоста. Без `MEMORY_FILE_PATH` файл лежав би в каталозі
пакета в кеші npx (`~/.npm/_npx/<hash>/…/server-memory/dist/memory.jsonl`) і
був би спільним для всіх проєктів на машині, які запускають той самий пакет.
Тому шлях задано явно: граф ізольовано в межах цього репо. Відносний шлях
сервер рахує від каталогу *пакета*, тому шлях абсолютний (`$PWD` після `cd`).
Очистити: `rm .mcp-memory.jsonl`.

**Які tools він дає агенту:**

- запис: `create_entities`, `create_relations`, `add_observations`,
  `delete_entities`, `delete_observations`, `delete_relations`
- читання: `read_graph`, `search_nodes`, `open_nodes`

**Перевірка, що працює:** `create_entities` (сутність `KB-1002`) →
`search_nodes("KB-1002")` повернув її → `delete_entities` прибрав. ✓
Окремо перевірено, що з новою конфігурацією `create_entities` записує саме в
`<репо>/.mcp-memory.jsonl`.

---

## Сервер 3 — catalog (власний, Task B)

| | |
|---|---|
| **Навіщо** | Відповіді про каталог через доменні функції `app/` (`lowStock`, `inventoryValue`, …) замість ручного парсингу JSON |
| **Транспорт** | stdio |
| **Як запускається** | `node ./mcp-server/dist/server.js` (через `sh -c`). Перед цим: `cd app && npm run build`, `cd mcp-server && npm install && npm run build` |
| **Область доступу (scope)** | читає лише `app/data/catalog.json` через `loadCatalog()` з `app/dist/index.js`; шлях до файлу рахується від модуля, не від cwd |
| **Секрети** | немає |
| **Версія** | свій код; SDK `@modelcontextprotocol/server` v2 зафіксовано в `mcp-server/package-lock.json` |

**Що він дає агенту:**

- tools: `search_inventory`, `check_stock`, `low_stock`, `catalog_summary` — усі read-only
- resource: `catalog://summary` — огляд каталогу (кількість, категорії, вартість запасів)

**Чому такий scope:** сервер не приймає шляхів і не має tools для запису чи
мережі, тож агент не може через нього вийти за межі каталогу.

**Перевірка, що працює:** `tools/list` → 4 tools, `resources/list` →
`catalog://summary`, `resources/read` → `Total inventory value: $46152.00`. У
Claude Code tools видно як `mcp__catalog__*`. ✓

---

## Що НЕ підключали і чому

- **git** — потребує Python + `uv`. Для цього завдання достатньо filesystem для `catalog.json`.
- **fetch** — потребує Python + `uv`. Каталог локальний, внутрішніх API немає. До того ж це
  джерело зовнішнього контенту, тобто канал для prompt injection, без жодної користі тут.

Свідома відмова від сервера з надто широкими правами або зайвими залежностями — інженерне рішення.

---

## Область доступу — головне

| Сервер | Задумано | Фактично (Claude Code) | Що обмежує насправді |
|---|---|---|---|
| filesystem | `./app/data`, read-only | корінь репо (roots), читання + запис | `permissions.deny` на 4 write-tools (лише в Claude Code) |
| memory | — | `<репо>/.mcp-memory.jsonl` | `MEMORY_FILE_PATH` |
| catalog | `app/data/catalog.json`, read-only | те саме | код сервера: немає параметрів-шляхів і write-tools |

- Не `/` і не `~`: розширення доступу на домашню теку — це дірка, через яку агент
  міг би витягти `.env` інших проєктів, SSH-ключі тощо.
- `roots` за специфікацією — механізм координації (сервер *SHOULD* їх
  поважати), до того ж deprecated у ревізії `2026-07-28`. Справжня межа — права ОС,
  окремий користувач або пісочниця; у цьому репо її **не** застосовано (прийнятий ризик).
