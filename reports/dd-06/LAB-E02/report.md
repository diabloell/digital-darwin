# Дефицит ресурсов

## Hypothesis
Дефицит пищи изменит численность, энергию и репродуктивный успех.

## Protocol
Изменяется только начальный запас и скорость роста пищи.
5 seed на условие: dd02-amber, dd02-fern, dd02-dune, dd02-coral, dd02-slate. 4000 тиков, выборка через 100. Burn-in: 0.

## Results
Статус completed, критерий DESCRIPTIVE. Основная метрика: Живые, организмов.

| Условие | Завершено | Вымирания | Среднее | Медиана | Мин…макс | Парное Δ | n пар |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Обычные ресурсы | 5/5 | 0/5 | 523.600 | 514.000 | 460.000…604.000 | 0.000 | 5 |
| 35% ресурсов | 5/5 | 0/5 | 183.000 | 177.000 | 43.000…315.000 | -340.600 | 5 |

| Условие | Seed | Статус | Тиков | Значение | Тик вымирания | SHA-256 | Ошибка |
| --- | --- | --- | --- | --- | --- | --- | --- |
| control | dd02-amber | completed | 4000 | 514.000 | — | 3b108aaaa2ea717aaf1e98a4d7ce2b1f1e067f786af27420f3862379730cd3d6 | — |
| scarcity | dd02-amber | completed | 4000 | 177.000 | — | 52294c337ed7f8591ca6d48654c680e21e3d67b13fc3f948be4b450fac2ff1bc | — |
| control | dd02-fern | completed | 4000 | 460.000 | — | cf83a7b1dd4056b7b0e1ddb4d7488c9a8a12b508c7872f68aa61079d7fc311b9 | — |
| scarcity | dd02-fern | completed | 4000 | 43.000 | — | c2b397b079ebdfcbfdd7e8cd9b4cf51e879d21b15eaf2969083418dfaf839a68 | — |
| control | dd02-dune | completed | 4000 | 505.000 | — | 5a2efe370ec17d949353b7775115820d02031072542fee9daa6dd226ae3e66ac | — |
| scarcity | dd02-dune | completed | 4000 | 94.000 | — | 0bd273345ea9a8b679d794ae74929db35e83859388b03f5c720efb2c64450a5b | — |
| control | dd02-coral | completed | 4000 | 535.000 | — | f59a9c7e0bdc9efd86d55d9334acffc159a9fa98e35b4233e822fa8d8dafdc31 | — |
| scarcity | dd02-coral | completed | 4000 | 286.000 | — | a111312ec0150876cc8c51ab7683df33f0553a570509dfa62d85001f70095cb5 | — |
| control | dd02-slate | completed | 4000 | 604.000 | — | ed1ce5d980d056ad51bfa5e8d495b5f07dcc79468d5cf1083a6b01ba53b7bc8c | — |
| scarcity | dd02-slate | completed | 4000 | 315.000 | — | 091093feca46da8ce7abca7b6f0c9097554429ffa0543feaa5bf1581cdb6e3c4 | — |

Траектории на общей шкале 34.000…635.000. Точка означает отсутствие значения. Исходные отсчёты в JSON и CSV.

~~~text
control/dd02-amber: ▃▅▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇█▇▇▇▇▇▇█▇▇▇▇▇▇▇▇▇▇▇▇▇▇
scarcity/dd02-amber: ▃▃▃▂▂▁▁▁▁▂▂▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▂▂▂▂▂▃▄▄▄▃▃▂▂▂
control/dd02-fern: ▃▅▆▆▇▇▇▆▆▆▆▆▆▆▇▇▇▇▇▇▇▇▇▇▇▇▇▆▆▆▆▆▇▇▇▇▇▆▆▆▆
scarcity/dd02-fern: ▃▃▃▂▁▁▁▁▁▁▂▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
control/dd02-dune: ▃▅▆▇▇▇▇▇▇▆▆▇▇▇▇▆▆▆▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇
scarcity/dd02-dune: ▃▃▃▂▁▁▁▁▁▁▂▁▁▁▁▁▁▂▂▁▁▁▁▁▁▁▂▁▁▂▂▂▁▁▁▁▁▁▁▁▁
control/dd02-coral: ▃▅▇▇▇▇▇▇▇▆▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇███████████▇▇
scarcity/dd02-coral: ▃▃▃▂▂▁▁▁▁▂▂▂▂▂▂▁▁▂▂▂▂▁▁▁▂▂▂▁▁▂▂▂▂▂▂▃▃▃▃▄▄
control/dd02-slate: ▃▅▇████████████████▇█████████████████████
scarcity/dd02-slate: ▃▃▃▃▂▂▁▁▂▂▂▂▂▁▁▁▁▂▁▁▁▁▁▁▁▁▂▂▂▂▂▂▂▂▂▂▂▃▃▄▄
~~~

## Interpretation
Фиксированный набор seed. Диапазон наблюдений описывает разброс, а не доверительный интервал. Связь признака с размножением не устанавливает причинность отдельного гена.
Средние парные различия относятся только к завершённым парам с определённой метрикой. Изменение численности и корреляции признаков описывают эту модель.

## Reproducibility
Scenario SHA-256: 1be9b9c0a6b9aec806bd2fc900f031408ffeb4597029514b655d5af464b41160. Engine 0.3.0, эволюция 1, метрики 1, сценарий 1. Среда: Node v24.22.3 linux/x64.

    node apps/lab.ts definition.json outputs/lab

~~~json
{
  "versions": {
    "format": 1,
    "engine": "0.3.0",
    "evolution": "1",
    "metrics": 1,
    "scenario": 1
  },
  "initial": {
    "width": 48,
    "height": 48,
    "population": 240
  },
  "seeds": [
    "dd02-amber",
    "dd02-fern",
    "dd02-dune",
    "dd02-coral",
    "dd02-slate"
  ],
  "replicas": 5,
  "duration": 4000,
  "interval": 100,
  "burnIn": 0,
  "stopPolicy": "fixed-ticks",
  "criterion": "invariants",
  "limitations": "Фиксированный набор seed. Диапазон наблюдений описывает разброс, а не доверительный интервал. Связь признака с размножением не устанавливает причинность отдельного гена.",
  "id": "LAB-E02",
  "title": "Дефицит ресурсов",
  "description": "Изменяется только начальный запас и скорость роста пищи.",
  "hypothesis": "Дефицит пищи изменит численность, энергию и репродуктивный успех.",
  "control": {
    "id": "control",
    "label": "Обычные ресурсы",
    "changes": {},
    "landscape": "patchy",
    "batch": 1
  },
  "treatments": [
    {
      "id": "scarcity",
      "label": "35% ресурсов",
      "changes": {
        "resourceScale": 0.35
      },
      "landscape": "patchy",
      "batch": 1
    }
  ],
  "primary": "population",
  "secondary": [
    "averagePopulation",
    "births",
    "deaths",
    "energy",
    "food",
    "reproduction",
    "speed",
    "sensor"
  ]
}
~~~
