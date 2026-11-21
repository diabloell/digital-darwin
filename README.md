# Digital Darwin

Локальная лаборатория искусственной жизни. DD-00: мир 256×256, 1000 организмов, пища, движение, энергия, бесполое размножение, наследование и мутации. Это абстрактная модель, не биологический прогноз.

## Запуск

Нужен **Node.js 24.3 или новее**. В папке проекта выполните одну команду:

```sh
node scripts/serve.mjs
```

Откройте **http://127.0.0.1:5173**. Установка пакетов не нужна. Сборка выполняется автоматически перед запуском. Для остановки сервера: Ctrl+C. Сервер слушает только loopback, публичного деплоя нет. При наличии npm можно использовать `npm start`.

Мир открывается на паузе. Нажмите «Запустить», выберите скорость или выполните один шаг. Колесо мыши масштабирует карту, перетаскивание перемещает камеру, клик выбирает организм. Кнопка «Выбрать организм» также открывает реальную особь. Space включает/останавливает время вне полей и кнопок; стрелки и +/- управляют камерой, Escape снимает выбор. Новый seed создаёт новый мир на паузе.

## Проверки

```sh
node scripts/build.mjs
node scripts/lint.mjs
node --test tests/unit.test.ts
node --test tests/integration.test.ts
node apps/cli.ts --seed dd00-verification --ticks 5000 --population 1000 --output reports/long-run-a.json
node apps/cli.ts --seed dd00-verification --ticks 5000 --population 1000 --output reports/long-run-b.json
node scripts/e2e.mjs
```

`node scripts/verify.mjs` выполняет всю матрицу, два длительных прогона и benchmark, сохраняет журналы и обновляет отчёт. Playwright нужен только для E2E; в среде разработки используется установленный runtime-пакет и Chrome. В другой среде установите Playwright отдельно (`npm install --no-save playwright`), используйте установленный Chrome/Edge или задайте `DD_BROWSER` как путь к браузеру. E2E маршрутизирует собранные файлы непосредственно в браузер, поэтому работает без loopback-сокетов; реальный модульный Worker и ядро не подменяются.

`node scripts/typecheck.mjs` запускает `tsc --noEmit`, если TypeScript установлен. В исходной среде компилятор и npm registry недоступны: это **NOT RUN**, а не пройденная проверка. `tsconfig.json` включает strict, но сборка только удаляет типы. Для полноценной статической проверки в обычной среде: `npm install --no-save typescript @types/node`, затем `node scripts/typecheck.mjs`. Нельзя трактовать успешную сборку как успешную типизацию.

## Структура

- `src/core/`: независимый движок и seeded RNG; без DOM, часов и сети.
- `src/worker.ts`, `src/protocol.ts`: планирование тиков и типизированные сообщения.
- `src/app.ts`, `src/style.css`, `index.html`: карта Canvas, контролы, инспектор, график.
- `apps/cli.ts`: тот же движок без браузера, SHA-256 полного состояния и измерения.
- `tests/`: инварианты и интеграционные сценарии.
- `docs/spec/`: копии доступной Notion-документации, включая планы последующих этапов.
- `reports/DD-00.md`, `reports/latest.json`: фактически выполненные проверки и ограничения.

Canvas/DOM и встроенные тесты Node выбраны вместо рекомендуемых React/Vite/PixiJS/Vitest/pnpm из-за недоступного менеджера пакетов и DNS. Это осознанное отклонение DD-00, а не утверждение об эквивалентности всех инструментов. Подробности и модель - в `ARCHITECTURE.md` и `docs/adr/001-dd00.md`.

## Репозиторий и перенос

Целевой репозиторий: https://github.com/diabloell/digital-darwin. Изменения DD-00 подготавливаются в ветке `dd-00-first-working-slice`; `main` не перезаписывается. Если подключение GitHub недоступно, скопируйте содержимое проекта в локальный checkout репозитория, исключив `dist`, `node_modules`, `tools`, `work`, `outputs` и `.git`, затем:

```sh
git switch -c dd-00-first-working-slice
git add .
git commit -m "Implement DD-00 living simulation and verification"
git push -u origin dd-00-first-working-slice
```

Не переносите каталог `.git` поверх другого checkout. PNG-скриншоты и JSON/логи в `reports/` служат доказательствами; при переносе их можно включить в коммит. Никаких ключей, секретов, облачных API или телеметрии приложению не требуется.
