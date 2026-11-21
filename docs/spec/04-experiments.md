Here is the result of "fetch" for the Page with URL https://app.notion.com/p/41f9fe7da94081908cffd395fdb42dce as of 2026-11-21T18:20:22.408Z:
<page url="https://app.notion.com/p/41f9fe7da94081908cffd395fdb42dce" icon="🔬">
<ancestor-path></ancestor-path>
<properties>
{"title":"04 — Эксперименты, аналитика и научная проверка"}
</properties>
<iconMetadata>{"type":"emoji","emoji":"🔬"}</iconMetadata>
<content>
<b>Цель:</b> дать возможность отделить эволюционные закономерности от артефактов генератора случайных чисел, красивых траекторий и интуитивных историй.

## 1. Что мы называем результатом эксперимента

Эксперимент - фиксированная декларация:

```json
{
  "experimentId": "scarcity-selection-v1",
  "engineVersion": "0.x",
  "scenarioVersion": "garden-v1",
  "seedSet": ["s001", "s002", "s003"],
  "conditions": [
    {"name": "control", "overrides": {"food.regrowth": 1.0}},
    {"name": "scarcity", "overrides": {"food.regrowth": 0.35}}
  ],
  "durationTicks": 50000,
  "sampleEveryTicks": 100,
  "metrics": ["alive", "mean_sensor_radius", "birth_rate", "extinctions"]
}
```

Каждое условие исполняется с <b>тем же набором seed</b> (парное сравнение), если механика допускает; затем несколько независимых seed для устойчивости. Не менять одновременно пять факторов без плана.

Результат содержит: параметры, версию, environment fingerprint, агрегаты, графики, сырые time series в ограниченном объёме, ошибки/исключённые прогоны и markdown вывод.

## 2. Инженерные и «биологические» метрики

| Метрика | Вычисление / смысл | Ограничение |
| --- | --- | --- |
| Alive population | число живых сущностей в конце tick | не свидетельствует об адаптации |
| Birth/death rate | births и deaths за окно / средняя популяция | на малых N шумно |
| Resource reserve | сумма доступной биомассы по сетке | зависит от размера мира |
| Energy balance | входы/потери/запасы по категориям | требует полноты учёта |
| Mean genotype | среднее/медиана гена среди живых | может меняться из-за дрейфа |
| Genetic variance | дисперсия по нормализованным локусам | меры зависят от шкал |
| Shannon lineage diversity | −sum(p\_i \* ln p\_i) | чувствительность к определению lineage |
| Reproductive success | число потомков на особь/lineage | сравнивать по возрасту и завершённым поколениям |
| Survival curves | доля живущих по возрастным когортам | поздние когорты цензурированы |
| Movement efficiency | net intake minus movement costs | proxy, не универсальная fitness |
| Selection response | изменение частот генов в условиях | нужен null/control |

У всех метрик должны быть versioned definitions, sampling frequency, units, missing values policy. Не проводить графики среднего по вымершим популяциям как нули без специальной маркировки.

## 3. Список эталонных экспериментальных сценариев

### E01 - детерминизм

Дважды запустить один seed/config на <code>10000</code> тиков в той же runtime-матрице, сравнить hashed checkpoints и финальный state hash. Критерий: полное совпадение. Отдельно проверять, что рендеринг/пауза/скорость не меняют исход.

### E02 - ресурсное ограничение

Сравнить Garden с удвоенным/уменьшенным поступлением пищи на нескольких seeds. Гипотеза: долгосрочная устойчивая численность/продолжительность жизни изменятся. Возможные исключения: конкуренция и стохастика. В отчёте дать доверительные интервалы между прогонами.

### E03 - наследование и мутация

Сравнить mutationRate=0 и baseline; изначально одинаковый геном и контрольные прогоны. Проверка: без мутаций наследуемые геномы не меняются, при мутациях появляется вариация. Это <b>не доказывает адаптацию</b>.

### E04 - отбор на стоимость/скорость

Ввести два типа распределения пищи (равномерная/пятнистая); посмотреть, меняется ли распределение движения/сенсорного радиуса относительно random neutral model. Интерпретация требует записанных trade-off в функции энергии.

### E05 - катастрофа

В заранее заданный tick уменьшить продукцию ресурсов на 60% в одном из paired runs; оценить вероятность вымирания, глубину bottleneck, время восстановления на репликациях.

### E06 - хищник-жертва (после модуля predators)

Запустить predator-prey с изменением эффективности охоты и защиты. Считать population cross-correlation и лаги. Не объявлять осцилляции без реальной временной зависимости.

### E07 - кооперация (после social signals)

Локальные сигналы увеличивают шанс обнаружения еды, но расходуют энергию и могут привлекать конкурентов. Проверять условия, при которых сигналы действительно повышают lifetime reproductive output; сравнить с бессмысленным сигналом/случайным соседством.

### E08 - performance

1k/5k/10k/25k/50k агентов на 256²/512² клетках, фиксированный seed, 1000 warm-up и 5000 measured ticks, устойчивый release build, timing p50/p95/ticks/sec, allocation, memory, FPS на отдельном UI-тесте. Значения - <b>пример протокола</b>, уточнять при реализации.

## 4. Контроль смещения

- <b>Повторения:</b> один необычный прогон не свидетельствует о закономерности.
- <b>Pre-register:</b> фиксировать гипотезу, метрики, seed set и длительность до просмотра результатов.
- <b>Пейринг:</b> сравнивать условия на одинаковых initial configurations; расхождение RNG потоков после вмешательства не ошибочно, но требует осторожного вывода.
- <b>Null models:</b> сравнивать с <code>mutationRate=0</code>, neutral random walk и/или random selection, когда это применимо.
- <b>Burn-in:</b> объявлять прогрев модели и не выбирать постфактум «красивый» диапазон.
- <b>Failures included:</b> вымершие миры - часть результатов; не отбирать только живые успешные эксперименты.
- <b>Uncertainty:</b> показывать распределение по репликам и диапазоны, а не только одну среднюю линию.
- <b>Causal caveat:</b> после манипуляции можно обсуждать эффект внутри симуляции, не переносить выводы на природу без внешней валидации.

## 5. Система экспериментов

Компоненты:

- <code>ScenarioRegistry</code>: immutable versioned configs.
- <code>ExperimentDefinition</code>: условия, seeds, output metrics, stop policy.
- <code>HeadlessRunner</code>: запускает чистый engine без Pixi/React.
- <code>MetricsSampler</code>: выборка по периодам, online aggregates.
- <code>ExperimentArchive</code>: manifest, summaries, series, failures, engine hash.
- <code>ComparisonView</code>: наглядные графики paired conditions с variance bands.
- <code>ReportBuilder</code>: JSON + Markdown + CSV/Parquet, где уместно.

Модульный масштаб: сначала локальные последовательные серии без сервера. Если понадобится параллелизм, independent seeded runs можно распределять по Worker threads или процессам CLI (для независимых прогонов это безопаснее детерминированного распараллеливания одного мира).

## 6. Batch job и прерывания

- Каждая задача имеет <code>runId</code>, <code>experimentId</code>, <code>seed</code>, <code>scenarioHash</code>, <code>progress</code> и <code>checkpoint</code>.
- При остановке можно возобновить неисполненные runs или один run из совместимого checkpoint, если движок поддерживает его.
- Результаты записывать атомарно: temp -> commit; помечать <code>completed</code>, <code>failed</code>, <code>partial</code> и ошибку.
- Не перегружать IndexedDB десятками гигабайт: aggregate & downsample, старые сырые series экспортируются и удаляются по явному решению пользователя.
- Ограничить concurrency по CPU/RAM; UI и batch runners не должны одновременно молча занимать все ядра.

## 7. Как представлять результаты

Каждый отчёт содержит:

1. Hypothesis / source of hypothesis
2. Version / seed set / config diff
3. Reproducibility / environment
4. Raw sample sizes, excluded/failed runs
5. Effect size and uncertainty
6. Alternative interpretations and known limitations
7. Figure with captions and units
8. Next action: accept/reject hypothesis within this model, or gather more evidence

Запрещена формулировка «симуляция доказала происхождение интеллекта» без операционных критериев и воспроизводимых наблюдений. Избегать маркетингового overclaim.

## 8. Интерактивные сценарии

<b>Compare two worlds:</b> кнопка «Сравнить» выбирает другой мир/эксперимент, синхронизирует оси tick, показывает overlay популяций/генов и таблицу различий.

<b>Rewind science vs rewind video:</b> выбор прошлого checkpoint позволяет открыть <b>записанное</b> состояние на конкретном tick; без checkpoint точный снимок прошлого реконструируется только через совместимый engine + seed + все команды + replay. Отдельно обозначать, когда UI показывает лишь агрегаты прошлого.

<b>Share experiment:</b> экспорт portable bundle с manifest и графиками; не обещать публичный сервис общего доступа.

## 9. Acceptance criteria

- Существуют минимум два эталонных эксперимента с честными прогонами, reproducibility hashes и осмысленным графиком.
- Результат одной реплики и статистика нескольких реплик не смешиваются.
- Политика ошибок показывает неуспешные прогоны.
- Сравнение двух разных seed имеет явный warning о конфаундерах.
- Хранятся версии метрик и конфигураций.
- Статистические заключения осторожны: данные искусственного мира не выдаются за реальный биологический эксперимент.
</content>
</page>
