# Локальная калибровка execution gas

21.09.2026. Измерения локальных LocalShortController / LocalMonthlyController и vault.
Это sampled operating envelope, не доказанный worst-case и не новый контрактный MAX_N.

## Что измеряем

- 100 / 1 000 / 10 000 синтетических участников, chunks по 64 (последний короче).
- normal10: тестовые normalRules, 10 мест; admitted64: nearCertainRules, 64 места.
- Для каждого масштаба оба draw frozen одновременно, два seed, обратный порядок seal
  между режимами и обратный порядок доставки seed между вариантами.
- Отдельные Short и Monthly при 1 000 участников / stress64.
- begin/publish/seal/process/finish: estimateGas, receipt.gasUsed, calldata bytes,
  block gas limit, effective price, фактическая native delta плательщика и контроллеров.
- После завершения reserved=0, free+claimable+unrecognized равны балансу vault.
  В stress-вариантах отдельно проверяется admission всех участников.

У Short 64 — допустимое число мест и размер chunk, но не максимальное число участников.
Исследование не проверяет все возможные ranks, seeds, rules, templates и размеры calldata.
При изменении правил/компилятора/адаптеров нужны новые измерения. Synthetic participants
не доказывают BUY provenance или производительность indexer. Quote budgets — тестовые
raw units; они не обозначают долларовый размер реального призового пула.

## Воспроизведение

```powershell
npm run report:execution:calibration
```

Создаётся уникальная папка `.local/logs/execution-calibration/run-*`: transactions.json,
summary.json, evidence.json, tables.md, measured-profile.json и данные boundary client.
Путь печатается после окончания. CALIBRATION_SIZES может сузить набор до `100` или `1000`;
CALIBRATION_CASE — например `admitted64-1000-BOTH`; CALIBRATION_OUTPUT меняет корневую
папку результатов. Каждый запуск создаёт новый run, не перезаписывая прежний state.

Первичный прогон использует обычный локальный fee market Hardhat: цена снижается с блоками.
Поэтому таблица сравнения считает стоимость при явно заданных 1/2 gwei. Это предположения,
не рыночные цены. Реальные observed цены/дельты есть в raw output.
Fixture RNG delivery вынесен из расходов исполнителя: реальный провайдер имеет свою fee
model. Не включены deployments, BUY/indexer, prize-flow, claims, RPC/keeper overhead,
реальный RNG, swaps/native refill, L1/blob/другие дополнительные сетевые комиссии.

## Проверка бюджета и перезапуска

Выбран admitted64 / 1 000 / оба frozen: бюджет одного draw не покрывает оба, повышение
заниженного bound переводит gate в nativeFunding, bootstrap topup разрешает продолжить.
Затем на каждую из 32 process и двух finish запускается свежий CLI child, который заново
читает сохранённые gas bounds и chain progress. Native price этого сценария закреплён
на 2 gwei. Native delta должна точно равняться сумме receipt.gasUsed * gasPrice.

Это чистые завершения дочерних процессов, не crash/unknown-send recovery. Measurement-only
calibration-chunk-client не является production worker и не заменяет coordinator pending
journal. Нельзя использовать его для реального исполнения. Такие отказные сценарии
проверяются существующими coordinator tests отдельно.

## Как использовать профиль

[Измеренный пример](examples/local-execution-budget-calibrated.json) — отдельный локальный
network profile. Для измеренных методов берётся max estimate × 1.10 с округлением вверх;
существующий safetyBps=12500 дополнительно применяется к native forecast. Это выбранный
запас, не доказательство верхней границы. Для неизмеренных closeEmpty/prize-flow методов остаётся
старое fixture значение 3M: их калибровка этим отчётом не закрыта.

Новый профиль не подменяет конфигурацию существующего state и не мигрирует обязательства.
Изменение immutable network model старого coordinator продолжает отвергаться. Старый
example остаётся лабораторным профилем; 3M не покрывает все измеренные операции stress64.

## Результаты

8 сценариев / 16 seed-вариантов, 2 280 measured transactions. Сводка объединяет основной
прогон с повтором N1k/admitted64/BOTH, в котором boundary проверен свежими CLI processes.
[Компактный JSON](../research/execution-budget-calibration.json) сохраняет параметры,
агрегаты и source hashes. Это gas evidence, не архив полной chain history.

| Режим | N | Порций на draw | Контуры | Gas за цикл, максимум двух seed | Native при 1 gwei |
|---|---:|---:|---|---:|---:|
| normal10 | 100 | 2 | BOTH | 6069649 | 0.006069649 |
| admitted64 | 100 | 2 | BOTH | 14374128 | 0.014374128 |
| normal10 | 1000 | 16 | BOTH | 28120735 | 0.028120735 |
| admitted64 | 1000 | 16 | BOTH | 56494032 | 0.056494032 |
| normal10 | 10000 | 157 | BOTH | 246564993 | 0.246564993 |
| admitted64 | 10000 | 157 | BOTH | 460466104 | 0.460466104 |
| admitted64 | 1000 | 16 | SHORT | 43888416 | 0.043888416 |
| admitted64 | 1000 | 16 | MONTHLY | 12552855 | 0.012552855 |

| Метод | Max estimate | Max receipt gas | Старые 3M / max estimate |
|---|---:|---:|---:|
| begin | 2034140 | 2026226 | 1.47 |
| publish | 441043 | 435935 | 6.80 |
| beginMonth | 298785 | 293624 | 10.04 |
| publishMonth | 440336 | 435236 | 6.81 |
| seal | 534613 | 498582 | 5.61 |
| sealMonth | 532707 | 496804 | 5.63 |
| deliver | 94002 | 87826 | n/a |
| processShort | 4238740 | 4205882 | 0.71 |
| processMonth | 450172 | 444958 | 6.66 |
| finishShort | 3148332 | 3129992 | 0.95 |
| finishMonth | 266565 | 243717 | 11.25 |

BOTH — полный Short + Monthly, включая подготовку, публикацию, seal и completion одного
seed-варианта. Fixture delivery исключён и отражён отдельно в JSON. При 2 gwei табличный
native вдвое больше; при 0.01 gwei — в сто раз меньше. Это масштабирование формулы,
не утверждение о текущей цене сети.

На boundary N1k/stress64: forecast 0.2150561475 native, фактическое completion потребление
0.083651658 native при 2 gwei (41 825 829 gas), остаток 0.1314044895. Это только уже frozen
completion, без подготовки. Сумма для одного draw 0.1945220925 native не покрывала два.
Успешны 34 отдельных CLI child, уникальные transaction hashes, повторного process нет.

Новый профиль покрывает сохранённые bounds этого boundary run. Запас получается большим:
max per-action применяется к каждой порции, хотя самая дорогая порция не повторяется
каждый раз. Уточнение модели по фазам возможно позже; сейчас это осознанная консервативность.

Регрессии: **37/37**, 0 failures, 424 s:

```powershell
node --test --test-concurrency=1 test/local-state-lock.test.cjs test/local-execution-budget.test.cjs test/local-coordinator.test.cjs test/local-controllers.test.cjs
```

Полный npm test и внешние fork/production интеграции не запускались.
