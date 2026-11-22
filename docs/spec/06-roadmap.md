> Историческая дорожная карта. Начиная с DD-07 актуальная последовательность описана в [ROADMAP.md](../../ROADMAP.md).

Here is the result of "fetch" for the Page with URL https://app.notion.com/p/41f9fe7da9408144abf8f2054f9e9602 as of 2026-11-21T18:21:54.563Z:
<page url="https://app.notion.com/p/41f9fe7da9408144abf8f2054f9e9602" icon="🚀">
<ancestor-path></ancestor-path>
<properties>
{"title":"06 — Roadmap, Codex [AGENTS.md](http://AGENTS.md) и контроль качества"}
</properties>
<iconMetadata>{"type":"emoji","emoji":"🚀"}</iconMetadata>
<content>
# Дорожная карта, задания Codex, тестирование и критерии релизов

<b>Принцип управления:</b> Codex - основной инженер и исполнитель. Пользователь не обязан кодировать, собирать окружение по частям или ежедневно принимать решения. Каждое задание создаёт завершённый, запускаемый, проверенный инкремент.

## 1. Продуктовые этапы (без фиктивных календарных сроков)

| Этап | Содержание | Результат / ворота |
| --- | --- | --- |
| P0 — Foundation | monorepo, TypeScript strict, тесты, CI, seed RNG, минимальный headless runner | <code>pnpm test</code> и <code>pnpm dev</code> работают |
| P1 — Living World | генерируемая карта, food, energy, movement, birth/death, визуализация | 1000 агентов живут и воспроизводятся, есть UI и seed |
| P2 — Evolution | genome, mutation, cost trade-offs, offspring tracking, lineage | наследование и отбора можно увидеть по метрикам |
| P3 — Observer MVP | красивый renderer, камера, инспектор, графики, pause/speed | полноценное приложение без кода |
| P4 — Persistence | save, load, export, import, checksum, history | один и тот же мир можно продолжить |
| P5 — Experiment Lab | presets, headless batch, deterministic comparisons | E01–E04 можно воспроизвести |
| P6 — Ecosystem 2.0 | predator-prey, climate, population cycles | новая механика не разрушает P1–P5 |
| P7 — Emergence | cooperation, signals, memory, adaptive controllers | evidence of new behavior (не обещание интеллекта) |
| P8 — Scale | профилирование, 25–50k агентов, optional WASM | измеренное ускорение при сохранении инвариантов |

<b>MVP</b> = P0–P4, с простым геномом и минимальными графиками; P5+ - развитие. Если P3/P4 труднее, позволено передвинуть задания без разрушения зависимостей.

## 2. Бэклог вертикальными срезами

### P0 (каждый пункт - отдельный небольшой PR)

- [ ] Создать проект, pnpm lockfile, TypeScript strict, lint/format/test workflow.
- [ ] Реализовать <code>SeededRng</code> и golden tests; инъекцию RNG через engine.
- [ ] Реализовать <code>WorldConfig</code> schema validator и generator (seed -> stable terrain/food).
- [ ] Создать простую headless CLI команду <code>simulate --seed ... --ticks 1000</code>.

### P1

- [ ] Organism storage/IDs/freelist; spawn/despawn.
- [ ] Движение с границами и spatial hash.
- [ ] Ресурсы, поедание без double spend, метаболизм.
- [ ] Размножение с разделением энергии и отчёт о смерти.
- [ ] Tick scheduler и инварианты.
- [ ] Canvas scene + первая статистика населения и кадров.

### P2

- [ ] Versioned genome, phenotype expression, mutation operator.
- [ ] Behavioral controller с наследуемыми weights и cost trade-offs.
- [ ] Lineage event schema, генеалогия родителей/потомков.
- [ ] 3 генетических метрики + эксперимент с нулевой мутацией.

### P3

- [ ] PixiJS renderer с zoom/pan, WebGL fallback и LOD.
- [ ] Панель управления и слои мира.
- [ ] Инспектор выбранного живого и умершего организма.
- [ ] Графики населения/ресурсов/генов и event aggregation.
- [ ] E2E smoke: create/pause/inspect.

### P4

- [ ] Определить binary snapshot schema + version manifest.
- [ ] IndexedDB repository с transactional commit.
- [ ] Save/Load с exact tick resume test.
- [ ] Export/Import с checksum, size limits, corruption handling.
- [ ] History/metrics retention и миграционная fixture v1.

### P5+

- [ ] Experiment registry, paired seed batches, отчёты, comparison charts.
- [ ] Predator-prey с отдельными systems/генами/тестами баланса.
- [ ] Seasons/climate, температуру и карту разнообразия.
- [ ] Social signals, cost model, контрэксперименты кооперации.
- [ ] Оптимизация с benchmarks, только затем решение про WASM.

## 3. Definition of Done для любого PR

<b>Готово</b> означает одновременно:

1. Функция действительно работает без моков на пользовательском пути.
2. Есть тесты на happy path, edge cases, инварианты и регрессии; CI зелёный.
3. Для engine изменения есть fixed seed experiment/golden diff или явное объяснение, почему golden change ожидаемый.
4. UI изменения проверены playwright/browser, хотя бы smoke и снимками там, где применимо.
5. Документация обновлена; dependencies закреплены; dev/prod запуск повторяем.
6. Нет неиспользуемых заглушек, ошибок typecheck/lint, console noise, «TODO вместо функции» в завершённом сценарии.
7. Performance budget не деградировал без измерения и отдельного решения.
8. Codex выдал короткий отчёт: <b>что реализовано / что проверено / что не проверено / как запустить / что делать дальше</b>.

## 4. Инструкции [AGENTS.md](http://AGENTS.md) (поместить в корень)

```markdown
# Digital Darwin — agent operating rules

You are the autonomous engineer for Digital Darwin.
Read README.md, ARCHITECTURE.md, docs/adr and current milestone before editing.

PRODUCT:
Build a deterministic, local-first artificial-life simulator.
Do not replace model behavior with random cosmetic events.
Never claim real biological proof from toy simulations.

ENGINE:
Keep pure simulation core independent from UI and persistence.
All randomness must be seeded. Every tick has deterministic phases.
Respect energy/resource budgets, unique entity IDs and state migrations.
Never silently break old saves or seeded regression tests.

SCOPE:
Work on ONE vertical slice per task. Choose reasonable implementation details
without asking the user unless blocked by missing credentials or destructive actions.
Avoid unnecessary frameworks and cloud dependencies.
Do not start large refactors unless required by a documented measured bottleneck.

SAFETY:
Do not deploy publicly, purchase services, access personal files outside the repo,
use secrets, or delete data without explicit permission.

QUALITY GATE:
Run relevant tests, typecheck, lint and at least one representative headless sim.
For UI changes, run browser smoke tests when tooling permits.
State exactly which checks were performed and which were not.
Document architecture changes in an ADR and update the milestone checklist.

REPORT:
Summarize changes, commands/tests/results, known gaps, and one suggested next task.
Do not bury blocking errors.
```

## 5. Режим расходования лимитов Codex

Не нужно искусственно «жечь» токены. Оптимизация для пользователя: <b>мало вмешательства и качественный готовый результат</b>. Типичная сессия Codex: открыть репозиторий -> вставить один milestone prompt -> принять отчёт после выполнения. Никакой гарантии, что агент продолжит работать заданное количество часов; задачи конечны и иногда требуют проверки.

Рекомендуемая cadence:

- <b>Первый запуск:</b> P0 + минимальный вертикальный срез P1; цель - работающая симуляция, не полный P4.
- <b>Следующий запуск:</b> завершение конкретной механики, unit/property tests, UX smoke.
- <b>После каждых 2–3 задач:</b> независимый audit/bug bash над текущим релизом.
- <b>Когда готов MVP:</b> большие инженерные задачи по масштабированию, экспериментам и визуализации.

## 6. Первый промпт Codex (копировать целиком)

```txt
Ты - автономный инженер проекта Digital Darwin. Прочитай Project Bible и
спецификации. Реализуй v0.1: один работающий вертикальный срез.
Сделай монорепозиторий TypeScript+Vite+React+PixiJS с pure headless
simulation core. Создай seeded world (256×256), минимум 1000 живых
организмов с наследуемым минимальным геномом, перемещением, пищей,
энергией, размножением, смертью и простым детерминированным tick loop.

Сделай локальную браузерную сцену с паузой, шагом, скоростью, seed и
отображением population/food. Не подменяй симуляцию косметикой.
Добавь Vitest: deterministic replay, food non-negativity, child energy
transfer, survival/death, one action/tick. Добавь headless CLI,
README с одной командой запуска и AGENTS.md.

Следуй документам, но выбирай простые технические компромиссы,
фиксируй отклонения в ADR. Запускай проверки самостоятельно.
Не делай публичного деплоя и не используй платные API.
В конце отчитайся: что реально работает, как запустить, тесты с
фактическими результатами, ограничения и 3 следующих задачи.
```

<b>Особое замечание:</b> Codex не имеет доступ к Notion автоматически, если не настроено подключение. Перед запуском <b>скопировать основные документы из Notion в </b><b><code>docs/spec/</code></b><b> Git репозитория</b> либо передать их как files/контекст. Не утверждать, что агент сам сможет прочитать страницы только по ссылкам.

## 7. CI, тестовая матрица и подтверждение качества

| Уровень | Частота | Что проверяет |
| --- | --- | --- |
| Typecheck/lint | каждый commit | строгие типы, безопасный импорт |
| Unit tests | каждый commit | mutation, energy, PRNG, collisions, genome |
| Property-based | каждый PR | invariants на множестве generated worlds |
| Golden seeded tests | каждый PR core | детерминизм в известной среде |
| Scenario integration | каждый PR systems | воспроизводимая динамика, базовые профили |
| UI smoke | каждый PR UI | создание/управление/пауза/выбор |
| Save/load regression | каждый PR persistence | roundtrip и old fixtures |
| Long-run sim | nightly / milestone | 100k ticks, NaN checks, leaks |
| Performance budget | milestone | TPS p50/p95/RAM, сравнение baseline |
| Security/import | релиз и parser changes | corrupt archive, ZIP traversal, quotas |

Разработчику запрещено утверждать «всё протестировано», если проверки были недоступны. Непрошедшие проверки отражать в отчёте.

## 8. Ворота релизов

<b>Gate MVP:</b> world generator + reproducible sim + visible life cycle + UI controls + inspector + save/load + README. 10k ticks на дефолтном пресете без NaN; 100k ticks в CI прогоне. Proof of inheritance/mutation. UI screenshot/smoke.

<b>Gate Evolution:</b> controlled experiments воспроизводят изменение наследуемых признаков и выводы не зависят от одного удобного seed. Панель lineage и history. Два разных мира можно сравнить.

<b>Gate Scale:</b> опубликован benchmark harness, target TPS подтверждён на конкретной машине, проведена проверка деградации. Улучшения не ломают детерминизм в объявленных границах.

## 9. Риски автономной разработки и защитные практики

- <b>Codex залипает на архитектуре:</b> ограничить первую задачу работающим вертикальным срезом и не более необходимого.
- <b>Задачи гигантские и непроверяемые:</b> одна milestone/PR, связанная вертикально с интерфейсом.
- <b>Код красивый, модель пустая:</b> требовать invariants + E02/E03 прежде, чем принимать анимацию.
- <b>Избыточное число модулей:</b> interfaces и boundaries могут быть логическими, не создавать пустые пакеты.
- <b>Всё работает только в браузере разработчика:</b> headless core, CI и cross-browser smoke.
- <b>Уход в перфекционизм:</b> приоритет играемого MVP; future ideas - backlog.
- <b>Сломаны данные пользователя:</b> transactional snapshots, не менять persistent world in-place без migration plan.

## 10. Реестр принятых решений и открытых вопросов

| Вопрос | На текущий момент |
| --- | --- |
| Публичный сайт или локально? | <b>Локально</b>; публичный деплой не нужен |
| Python vs TypeScript? | <b>TypeScript для первого движка</b>; Python/Mesa - научный референс/альтернатива |
| Большой 3D мир? | <b>Нет</b>, сначала 2D |
| Реалистичные животные/мозги? | <b>Нет</b>, абстрактные агенты + trade-offs |
| Обучающие задачи для пользователя? | <b>Нет</b>, полностью автономная разработка |
| Сетевая синхронизация? | <b>Нет</b>, local-first |
| Сохранения? | <b>Да, обязательно к MVP</b> |
| Какие показатели у «разумности»? | Открытый вопрос; не внедрять до определения |
| Способ ускорения до 100k агентов? | Открытый вопрос, решать по benchmark |
| Название/бренд/логотип? | Digital Darwin - рабочее название |

## 11. Change-control для будущих механик

Каждая новая идея оформляется отдельным <code>FEATURE-XXX</code>:

- Пользовательская ценность
- На какие биологические инварианты влияет
- Новые гены/компоненты/event kinds
- Схема миграции и backward compatibility
- Минимальный вертикальный срез
- Эксперимент, отличающий новый механизм от старого
- Бюджет performance
- Тесты и acceptance criteria

Если у фичи нет проверяемого механического эффекта, это декоративное расширение, а не эволюционный прорыв.

## 12. Краткий roadmap для пользователя

<b>P0–P1:</b> открыть локальный сайт, увидеть движущуюся экосистему. <b>P2–P3:</b> исследовать отдельных организмов, заметить наследственные изменения. <b>P4:</b> сохранять мир и возвращаться к нему. <b>P5+:</b> полноценные сравнения альтернативных эволюций, новые экосистемы, хищники, кооперация и ускорение.
</content>
</page>
