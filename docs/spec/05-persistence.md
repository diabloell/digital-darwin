Here is the result of "fetch" for the Page with URL https://app.notion.com/p/41f9fe7da94081168e62f8224afc98a2 as of 2026-11-21T18:21:54.553Z:
<page url="https://app.notion.com/p/41f9fe7da94081168e62f8224afc98a2" icon="💾">
<ancestor-path></ancestor-path>
<properties>
{"title":"05 — Сохранения, форматы, replay и данные"}
</properties>
<iconMetadata>{"type":"emoji","emoji":"💾"}</iconMetadata>
<content>
<b>Главный тезис:</b> «один seed» недостаточен для повторного создания мира. Необходимы версия движка, полный конфиг, версии модулей, состояние PRNG, команда/интервенции, и - для быстрого восстановления - периодический snapshot.

## 1. Классы информации

| Класс | Примеры | Режим |
| --- | --- | --- |
| Immutable World Manifest | seed, версия движка, сценарий, дата создания, настройки | Всегда хранить |
| Current Simulation State | поле, организмы, RNG state, tick, outstanding intents | Snapshot, атомарная запись |
| Command Log | intervention, pause-independent mutations, appliedAtTick | Версионированный append-only |
| Historical Events | extinction, catastrophe, lineage split | Хранить с политикой ретенции |
| Metrics Series | population, diversity, resources by tick | Downsample / aggregate |
| Lineage Index | parent ids, birth/death info, ancestor summaries | Компактно/порциями |
| UI Preferences | панели, слой, зум, скорость отображения | Отдельно, не влияет на engine |
| Experiment Bundles | conditions, seeds, outcome, failures | Отдельные данные, export |

<b>Не смешивать:</b> внешний DTO интерфейса не равен бинарному внутреннему слепку ядра. Никакой компонент React не читает внутренние TypedArrays напрямую.

## 2. Предлагаемый контракт world manifest

```json
{
  "fileFormat": "digital-darwin-world",
  "fileFormatVersion": 1,
  "worldId": "uuid",
  "title": "Coral Basin",
  "createdAt": "ISO-8601",
  "engine": {"name": "darwin-core", "version": "0.1.0", "buildHash": "sha256..."},
  "protocolVersion": 1,
  "scenario": {"id": "garden", "version": 1},
  "config": {"width": 256, "height": 256, "seed": "example-seed"},
  "moduleVersions": {"ecology": "1.0", "reproduction": "1.0"},
  "snapshot": {"tick": 12345, "codec": "binary-v1", "checksum": "sha256...", "path": "state.bin"},
  "commands": {"path": "commands.jsonl", "firstTick": 0, "lastTick": 12345},
  "metrics": {"path": "metrics.csv", "intervalTicks": 100},
  "compatibility": {"minReader": 1, "maxReader": 1}
}
```

Схема иллюстративная. Production schema может быть более строгой с JSON Schema/Zod и полными полями. <b>Не хранить timestamp создания в детерминированном state hash</b>: timestamp относится к метаданным архива.

## 3. Что входит в точный snapshot

- tick index и версия/хеш алгоритма scheduler;
- состояние всех world field arrays и конфиг топологии;
- все живые организмы: внутренние слоты, external ID, genome, age, energy, position, movement, phenotype caches или правила пересчёта;
- идентификаторы следующих сущностей, parent links и необходимые lineage summaries;
- все RNG streams и counters, включая зарезервированные scope;
- состояния модулей, timers, cooldowns, queued deterministic commands;
- любые дополнительные поля, влияющие на следующие тики.

<b>Не входит:</b> UI панель, мышь, анимационные частицы, tooltip, посторонние wall-clock данные, необязательные метрики, если они не меняют симуляцию.

Snapshot должен быть согласован по tick boundary и иметь checksum. Если сериализация асинхронная, сначала создаётся согласованная копия на границе тика либо pause/freeze deterministic state; нельзя снимать разные компоненты на разных тиках.

## 4. Разделение snapshot, replay и history

- <b>Snapshot:</b> быстро восстановить точное состояние на tick T.
- <b>Replay:</b> воспроизвести переход от checkpoint T до нужного tick T+k на <b>совместимой версии</b> с журналом команд.
- <b>History aggregates:</b> показать старые графики/события без полного replay, но не обещать восстановить расположение каждой особи.
- <b>Video rewind:</b> только при доступном snapshot/replay, иначе просмотр истории исключительно аналитический.

Интервал snapshots зависит от размера мира и стоимости восстановления, а не от произвольного «каждые 100 тиков». Стартовая конфигурация: ручное сохранение + autosave по времени/тикам; профилировать задержку и quota.

## 5. Местное хранилище

Базовый браузерный persistence:

- IndexedDB базы <code>digital-darwin</code>: stores <code>worlds</code>, <code>snapshots</code>, <code>commandLog</code>, <code>metrics</code>, <code>events</code>, <code>lineage</code>, <code>experiments</code>.
- IndexedDB transaction boundaries на сохранение индекса + указателя на завершённый chunk. До commit новый snapshot невидим как current.
- Большие blobs/chunks хранить раздельно. Возможен двухфазный протокол: write chunk -> verify -> swap active pointer -> GC previous.
- После сбоя нельзя получать полумир с частично новыми массивами.
- Политика quota: показывать размер мира и свободное ориентировочное место; обрабатывать <code>QuotaExceededError</code> и предоставлять export/cleanup.
- Опциональные adapters после MVP: file-system export/import; desktop SQLite при появлении desktop shell; remote/cloud - только если появится реальная потребность.

<b>Оговорка:</b> браузер может удалить данные при нехватке диска или политике хранения. Экспорт мира в файл - обязательная пользовательская функция.

## 6. Файловый формат и совместимость

Предлагаемый portable bundle <code>.darwin.zip</code>:

```txt
manifest.json
state/snapshot-00012345.bin
replay/commands.jsonl
history/events.jsonl
history/metrics.csv
lineage/lineage-index.bin
checksums.json
report/README.md
```

- Сжатие per payload или zip с лимитом RAM. Защита от огромных архивов и распаковки на диск.
- Каждый модуль сериализует собственную versioned секцию <code>moduleId, version, byteLength</code>; незнакомые обязательные модули -> читать только metadata или отказ с инструкцией.
- Поддержка миграций <code>v1->v2</code>, <code>v2->v3</code>; тестировать на фикстурах старых версий.
- Важный принцип: <b>не требовать от нового движка повторения RNG sequence старого</b>. Для точного replay либо совместимый interpreter/engine, либо совместимый snapshot и отказ от точной реконструкции.
- Экспорт не должен содержать персональные пользовательские данные, системные пути или токены.

## 7. События и lineage без бесконечного роста данных

- Уровни event logging: Critical (всегда), Summary (по окнам), Verbose (в выбранной зоне/на выбранных агентах). Verbose выключен по умолчанию.
- Содержимое organism death archive: <code>entityId, parentIds, birthTick, deathTick, deathCause, genomeDigest, childCount, lineageId</code>.
- Не хранить полную траекторию всех организмов на все тики. Для выбранного - bounded ring buffer и опциональный экспорт.
- Для графиков хранить fine samples за последние N тиков и downsampled aggregates для старых эпох, вместе с методом агрегации.
- В ретенции защищать от удаления необходимые связи родословной; разрешать компактную «запись-предок» без полного био.

## 8. API persistence layer

```ts
interface PersistencePort {
  listWorlds(): Promise<WorldListItem[]>;
  saveWorld(bundle: SerializableWorld, options: SaveOptions): Promise<SaveReceipt>;
  loadWorld(worldId: string): Promise<RestorableWorld>;
  exportWorld(worldId: string): Promise<Blob>;
  importWorld(file: Blob): Promise<WorldImportResult>;
  deleteWorld(worldId: string): Promise<void>;
  readMetrics(worldId: string, range: TickRange): Promise<MetricSeries[]>;
}
```

- Движок выдаёт <code>SerializableWorld</code>, storage знает только формат. UI не формирует binary world.
- SaveReceipt содержит сохранённый tick и hash; UI показывает tick, а не просто «готово».
- Все действия idempotent где возможно; delete - с подтверждением и безопасным undo только если технически реализован.

## 9. Гарантии и тестирование

1. Roundtrip: <code>serialize->deserialize->step(1000)</code> совпадает с непрерывным прогоном на поддерживаемой runtime.
2. Power loss simulation: оборвать запись посередине -> прошлый snapshot доступен.
3. Migration fixtures: старый world открывается новым reader, или получает понятную несовместимость.
4. Corruption: повреждённый chunk, checksum mismatch, truncated JSONL -> аккуратная ошибка.
5. Quota: большой save при недостаточном месте не портит существующие миры.
6. Import: архив с traversal path, неверным fileFormat, запредельным decompressed size -> reject.
7. Replay: seed/config+commands даёт match в совместимом engine, а вмешательства видны на correct tick.
8. Privacy: без пользовательского согласия нет upload или внешней телеметрии.
9. Performance: сохранение не блокирует UI на заметное время; budget определить после первого измерения.

## 10. Масштаб хранения: ориентиры и ограничения

Основной потребитель памяти может оказаться не карта, а история. Например, 256×256×4 числовых поля×4 байта ≈ 1 МБ на сырые поля; 50 000 агентов×100–200 байт ≈ 5–10 МБ на базовые структуры (оценка <b>только для планирования</b>, реализация отличается). Если сохранять полные 10-МБ состояния на каждый из 100 000 тиков, получится \~1 ТБ: запрещаем такой дизайн.

Схема должна демонстрировать две независимые цифры: <b>время восстановления</b> и <b>расход диска</b>. Механизмы исправления: adaptive snapshots + sparse events + downsampling + bounded trajectories.
</content>
</page>
