# Подвижность и сенсоры

## Hypothesis
Связь скорости и радиуса с частотой рождений зависит от пространственной структуры пищи.

## Protocol
Начальная пища, ёмкость и рост перераспределяются без изменения их сумм. Нейтральная пара отделяет прямой эффект выраженного фенотипа.
5 seed на условие: dd02-amber, dd02-fern, dd02-dune, dd02-coral, dd02-slate. 4000 тиков, выборка через 100. Burn-in: 0.

## Results
Статус completed, критерий DESCRIPTIVE. Основная метрика: Рождения: высокий − низкий радиус, на 1 000 организм-тиков.

| Условие | Завершено | Вымирания | Среднее | Медиана | Мин…макс | Парное Δ | n пар |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Равномерная | 5/5 | 0/5 | -0.100 | -0.090 | -0.160…-0.070 | 0.000 | 5 |
| Пятнистая | 5/5 | 0/5 | -0.143 | -0.118 | -0.205…-0.115 | -0.043 | 5 |
| Равномерная · нейтральная | 5/5 | 0/5 | 0.124 | 0.114 | 0.084…0.162 | 0.223 | 5 |
| Пятнистая · нейтральная | 5/5 | 0/5 | -0.016 | -0.023 | -0.087…0.127 | 0.084 | 5 |

| Условие | Seed | Статус | Тиков | Значение | Тик вымирания | SHA-256 | Ошибка |
| --- | --- | --- | --- | --- | --- | --- | --- |
| control | dd02-amber | completed | 4000 | -0.070 | — | 83511628295ded30ae27d422f7df7e4904ccdd6e3c7687caab583517a6ca42fe | — |
| patchy | dd02-amber | completed | 4000 | -0.118 | — | 3b108aaaa2ea717aaf1e98a4d7ce2b1f1e067f786af27420f3862379730cd3d6 | — |
| neutral-uniform | dd02-amber | completed | 4000 | 0.114 | — | ee3c6cd723f82244d7e1be5ed3f25fac64ec367b6c4a12a62fdacb1090d72950 | — |
| neutral-patchy | dd02-amber | completed | 4000 | -0.082 | — | be8d09a4b1a8759e8ef8d87c72db7edfbf6b287375fb063ca06ecc3e81af13d9 | — |
| control | dd02-fern | completed | 4000 | -0.160 | — | e443c4566dc5be73505fd9a210454ba329225f9ebd4c2f6a16bcb81dad5a1202 | — |
| patchy | dd02-fern | completed | 4000 | -0.159 | — | cf83a7b1dd4056b7b0e1ddb4d7488c9a8a12b508c7872f68aa61079d7fc311b9 | — |
| neutral-uniform | dd02-fern | completed | 4000 | 0.084 | — | b71b48bef0cf09c330219e30b2f2311d0fadae51e458e8d8c1a9ae41e1176089 | — |
| neutral-patchy | dd02-fern | completed | 4000 | 0.127 | — | bcc2e3202b8b3f0d7b12baceba8f60cf1d28f68827b783defc007d37aaab1168 | — |
| control | dd02-dune | completed | 4000 | -0.094 | — | b674f433270f771d16e2affc8b10bdcbb5d5895a58e9ca93f3585b6951ee48b2 | — |
| patchy | dd02-dune | completed | 4000 | -0.205 | — | 5a2efe370ec17d949353b7775115820d02031072542fee9daa6dd226ae3e66ac | — |
| neutral-uniform | dd02-dune | completed | 4000 | 0.162 | — | 9ab8a743252ed9940ef41b00a3974038cec96d9b79d9ce2d71e813915a31e251 | — |
| neutral-patchy | dd02-dune | completed | 4000 | -0.087 | — | 15b3cd82db4644b6becdb72934dff814b12552c678f6ed607cc8387e0b0fb41c | — |
| control | dd02-coral | completed | 4000 | -0.090 | — | 1dbf1edea02db3f16d553e87c6af71e95787f66d668c84062160fc806dec0ff0 | — |
| patchy | dd02-coral | completed | 4000 | -0.115 | — | f59a9c7e0bdc9efd86d55d9334acffc159a9fa98e35b4233e822fa8d8dafdc31 | — |
| neutral-uniform | dd02-coral | completed | 4000 | 0.156 | — | 2aee6f822f583178f42021f7075754c472b7914c770514487ccfe6a5cb7c44f7 | — |
| neutral-patchy | dd02-coral | completed | 4000 | -0.023 | — | 987d455f6fb0daa04049693e561b0e4c8a419506ad79b88ae68618d11692342d | — |
| control | dd02-slate | completed | 4000 | -0.085 | — | 5714c10eef73d2bdd1ca7d230134fb2e3fbda950b4c3376fe865c68369bf4ce8 | — |
| patchy | dd02-slate | completed | 4000 | -0.117 | — | ed1ce5d980d056ad51bfa5e8d495b5f07dcc79468d5cf1083a6b01ba53b7bc8c | — |
| neutral-uniform | dd02-slate | completed | 4000 | 0.102 | — | c39af49a973a1a87d34e6d05b1a7216203e1e61cc39c981c3a99afe1d8846893 | — |
| neutral-patchy | dd02-slate | completed | 4000 | -0.013 | — | d747376105cb8accec8825a0bc58f44a3e3c4c51a9aa24f3a12efb9cc9215ce8 | — |

Траектории на общей шкале -1.301…0.726. Точка означает отсутствие значения. Исходные отсчёты в JSON и CSV.

~~~text
control/dd02-amber: ·▅▃▄▄▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅
patchy/dd02-amber: ·▇▅▅▅▅▅▅▅▅▅▅▅▅▆▆▆▆▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅
neutral-uniform/dd02-amber: ·▅▆▄▅▅▅▅▅▅▅▅▅▅▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆
neutral-patchy/dd02-amber: ·█▆▆▅▅▅▅▅▅▆▅▅▆▅▅▆▆▆▆▆▆▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅
control/dd02-fern: ·▁▄▄▅▄▄▄▄▄▄▄▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅
patchy/dd02-fern: ·▁▃▄▄▄▄▅▄▄▄▄▄▄▅▄▅▅▅▄▅▄▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅
neutral-uniform/dd02-fern: ·▇▆▆▆▇▇▇▇▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆
neutral-patchy/dd02-fern: ·▆▅▆▆▆▆▆▅▅▅▅▅▅▅▅▆▆▆▆▆▅▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆
control/dd02-dune: ·▃▃▄▄▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅
patchy/dd02-dune: ·▃▄▄▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅
neutral-uniform/dd02-dune: ·▆▆▆▅▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆
neutral-patchy/dd02-dune: ·▂▅▄▅▆▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▆▆▆▆▆▆▆▆▅▅▅▅▅▅▅▅▅▅▅▅
control/dd02-coral: ·▁▄▅▅▅▅▆▆▆▆▆▆▆▆▆▅▅▆▆▆▆▆▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅
patchy/dd02-coral: ·▃▃▄▄▄▅▅▅▅▅▅▅▅▅▅▅▆▆▆▆▆▆▆▆▆▆▆▅▅▅▅▅▅▅▅▅▅▅▅▅
neutral-uniform/dd02-coral: ·▃▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▇▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆
neutral-patchy/dd02-coral: ·▇▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆
control/dd02-slate: ·▅▅▄▄▄▄▅▅▅▄▄▄▄▄▄▄▄▄▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅
patchy/dd02-slate: ·▅▃▃▄▄▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅▅
neutral-uniform/dd02-slate: ·▇▅▆▆▆▆▆▆▆▆▇▇▇▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆
neutral-patchy/dd02-slate: ·▅▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆▆
~~~

## Interpretation
Фиксированный набор seed. Диапазон наблюдений описывает разброс, а не доверительный интервал. Связь признака с размножением не устанавливает причинность отдельного гена.
Средние парные различия относятся только к завершённым парам с определённой метрикой. Изменение численности и корреляции признаков описывают эту модель.

## Reproducibility
Scenario SHA-256: 33cba6d1afee485ce2f720b2293ee147f288b3f08b082b78a5784d18bc938b48. Engine 0.3.0, эволюция 1, метрики 1, сценарий 1. Среда: Node v24.22.3 linux/x64.

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
  "id": "LAB-E04",
  "title": "Подвижность и сенсоры",
  "description": "Начальная пища, ёмкость и рост перераспределяются без изменения их сумм. Нейтральная пара отделяет прямой эффект выраженного фенотипа.",
  "hypothesis": "Связь скорости и радиуса с частотой рождений зависит от пространственной структуры пищи.",
  "control": {
    "id": "control",
    "label": "Равномерная",
    "changes": {},
    "landscape": "uniform",
    "batch": 1
  },
  "treatments": [
    {
      "id": "patchy",
      "label": "Пятнистая",
      "changes": {},
      "landscape": "patchy",
      "batch": 1
    },
    {
      "id": "neutral-uniform",
      "label": "Равномерная · нейтральная",
      "changes": {
        "rule": "neutral"
      },
      "landscape": "uniform",
      "batch": 1
    },
    {
      "id": "neutral-patchy",
      "label": "Пятнистая · нейтральная",
      "changes": {
        "rule": "neutral"
      },
      "landscape": "patchy",
      "batch": 1
    }
  ],
  "primary": "sensorGap",
  "secondary": [
    "speedGap",
    "speed",
    "sensor",
    "speedMedian",
    "sensorMedian",
    "speedVariance",
    "sensorVariance",
    "survival",
    "dissipated",
    "births"
  ]
}
~~~
