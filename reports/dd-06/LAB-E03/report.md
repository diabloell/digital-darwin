# Мутации ON / OFF

## Hypothesis
Мутации создают новые варианты, но рост разнообразия может не сопровождаться ростом численности или числа рождений.

## Protocol
Основатели и пища совпадают. Меняется вероятность мутации.
5 seed на условие: dd02-amber, dd02-fern, dd02-dune, dd02-coral, dd02-slate. 4000 тиков, выборка через 100. Burn-in: 0.

## Results
Статус completed, критерий DESCRIPTIVE. Основная метрика: Уникальные генотипы живых.

| Условие | Завершено | Вымирания | Среднее | Медиана | Мин…макс | Парное Δ | n пар |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Мутации OFF | 5/5 | 0/5 | 50.200 | 48.000 | 35.000…73.000 | 0.000 | 5 |
| Мутации ON | 5/5 | 0/5 | 352.400 | 353.000 | 306.000…388.000 | 302.200 | 5 |

| Условие | Seed | Статус | Тиков | Значение | Тик вымирания | SHA-256 | Ошибка |
| --- | --- | --- | --- | --- | --- | --- | --- |
| control | dd02-amber | completed | 4000 | 48.000 | — | bb7a55f80b8f0e7d16dfd8d2548173ce429399ae7f40159ea2a3c82cbdd94e5c | — |
| mutations | dd02-amber | completed | 4000 | 353.000 | — | 3b108aaaa2ea717aaf1e98a4d7ce2b1f1e067f786af27420f3862379730cd3d6 | — |
| control | dd02-fern | completed | 4000 | 35.000 | — | 2012b57fb625e767e6c2ae819b1f7d4b2a2f1a8e168ebd0745d213ec0d7224b1 | — |
| mutations | dd02-fern | completed | 4000 | 306.000 | — | cf83a7b1dd4056b7b0e1ddb4d7488c9a8a12b508c7872f68aa61079d7fc311b9 | — |
| control | dd02-dune | completed | 4000 | 53.000 | — | 22bd363985e92f909fe9d17f488c8773941d02f4f03cf54e94b6cfd279efc237 | — |
| mutations | dd02-dune | completed | 4000 | 343.000 | — | 5a2efe370ec17d949353b7775115820d02031072542fee9daa6dd226ae3e66ac | — |
| control | dd02-coral | completed | 4000 | 73.000 | — | 73781d3ca5ec344e678fbc5c54438fb1d67bbcae0bbd567340ae8734e58f2507 | — |
| mutations | dd02-coral | completed | 4000 | 372.000 | — | f59a9c7e0bdc9efd86d55d9334acffc159a9fa98e35b4233e822fa8d8dafdc31 | — |
| control | dd02-slate | completed | 4000 | 42.000 | — | 967cf09227ee6aba046767fd3305fd3189a57e47088dd08c582992f6acfb3d29 | — |
| mutations | dd02-slate | completed | 4000 | 388.000 | — | ed1ce5d980d056ad51bfa5e8d495b5f07dcc79468d5cf1083a6b01ba53b7bc8c | — |

Траектории на общей шкале 35.000…395.000. Точка означает отсутствие значения. Исходные отсчёты в JSON и CSV.

~~~text
control/dd02-amber: ▅▅▅▅▅▅▄▄▄▄▄▃▃▃▃▃▃▃▃▃▂▂▂▂▂▂▂▂▂▁▁▁▁▁▁▁▁▁▁▁▁
mutations/dd02-amber: ▅▇▇██▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇██▇▇████████████
control/dd02-fern: ▅▅▅▅▅▄▄▄▄▃▃▃▃▃▂▂▂▂▂▂▂▂▂▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁
mutations/dd02-fern: ▅▆▇▇▇█▇▇▇▇▇▇▆▆▆▇▇▇▇▇▇▆▇▇▇▇▇▆▇▇▇▇▇▇▇▇▇▇▇▇▇
control/dd02-dune: ▅▅▅▅▅▄▄▄▃▃▃▃▃▃▃▂▂▂▂▂▂▂▂▂▂▂▂▂▂▂▁▁▁▁▁▁▁▁▁▁▁
mutations/dd02-dune: ▅▇▇█▇▇▇▇▇▆▆▆▆▆▇▆▆▇▇▆▇▇▇▆▆▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇
control/dd02-coral: ▅▅▅▅▅▄▄▄▄▄▃▃▃▃▃▃▃▃▃▃▃▂▂▂▂▂▂▂▂▂▂▂▂▂▂▁▁▁▁▁▁
mutations/dd02-coral: ▅▇▇███▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇███████████
control/dd02-slate: ▅▅▅▅▅▄▄▄▄▄▄▃▃▃▃▃▃▃▃▂▂▂▂▂▂▂▂▂▂▂▁▁▁▁▁▁▁▁▁▁▁
mutations/dd02-slate: ▅▇▇██████▇█████████▇▇████████████████████
~~~

## Interpretation
Фиксированный набор seed. Диапазон наблюдений описывает разброс, а не доверительный интервал. Связь признака с размножением не устанавливает причинность отдельного гена.
Средние парные различия относятся только к завершённым парам с определённой метрикой. Изменение численности и корреляции признаков описывают эту модель.

## Reproducibility
Scenario SHA-256: 5619fe2a7b0d771742847fc3e2d599a95928e3fdf0f5203a41de4d570766b8ba. Engine 0.3.0, эволюция 1, метрики 1, сценарий 1. Среда: Node v24.22.3 linux/x64.

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
  "id": "LAB-E03",
  "title": "Мутации ON / OFF",
  "description": "Основатели и пища совпадают. Меняется вероятность мутации.",
  "hypothesis": "Мутации создают новые варианты, но рост разнообразия может не сопровождаться ростом численности или числа рождений.",
  "control": {
    "id": "control",
    "label": "Мутации OFF",
    "changes": {
      "mutationRate": 0
    },
    "landscape": "patchy",
    "batch": 1
  },
  "treatments": [
    {
      "id": "mutations",
      "label": "Мутации ON",
      "changes": {
        "mutationRate": 0.12
      },
      "landscape": "patchy",
      "batch": 1
    }
  ],
  "primary": "variants",
  "secondary": [
    "population",
    "births",
    "outsideFounder",
    "mutations",
    "reproduction",
    "speedVariance",
    "sensorVariance"
  ]
}
~~~
