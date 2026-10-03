# Итоговая проверка тестового кандидата

Кандидат: `1a29a137aa17e04f04d920c4d3a87599b0fb9be6`, чистое рабочее дерево.
Дата:03.10.2026. Полный прогон завершён:893/894 PASS; единственная ошибка
каталога тестов исправлена, адресный повтор launcher5/5 PASS. Полного зелёного
прогона новой ревизии не заявляем. Runtime/контракты/выбор профилей не менялись.
Это проверка тестового контура, не разрешение публичного запуска.

## Объём и границы

| Область | Что включено | Что не выдаём за проверенное |
|---|---|---|
| Учёт/контракты/исполнители | Полный канонический `npm run test:review`,128 файлов на одном SHA | Не аудит безопасности, не public execution |
| Сайт и кошельки | Отдельный browser/Claim набор на том же SHA | Не ручная смена аккаунта в установленном MetaMask |
| Reference models | Шесть Python suites на том же SHA | Не новая продуктовая математика |
| Pons integration | Существующие fork evidence и актуальные regression tests | Общий fork был на прежнем SHA; не называем его новым fork этого HEAD |
| Отказы/нагрузка | Текущие regression tests плюс датированные joint/10k/recovery evidence | Не смесь всех будущих маршрутов, не failover провайдеров и не мировой масштаб |
| Production | Ничего не включено | Реальные signer/roles/manifest/finality/services относятся к следующему этапу |

Выбранный охват маршрутов — [матрица Pons](PONS_CHANNEL_COVERAGE.md).
Неподдержанные native/split/multi-op/paymaster/чужие пулы не становятся
поддержанными из-за зелёного набора. Порог100USDG и призовые правила неизменны.

## Итог основного прогона

`npm run test:review` на чистом `1a29a13`:128 файлов,894 сценария,
893 passed /1 failed /0 skipped /0 cancelled, exit1;54.6 минуты вместе
с установкой/cleanup. Одна основная компиляция,45 повторных использований,
cleanupError=null. Node24.21.0, npm11.19.0, Hardhat2.29.1, ethers6.17.0, solc0.8.37.
[Машиночитаемый итог и хеши локальных logs](evidence/TEST_CANDIDATE_2026-10-03.json).

Единственное падение: `test/test-launcher.test.cjs` требовал включения каждого
файла scoped-профилей в canonical full. Но purchase-ui/pons-browser/pons-failures
включают browser suites из web/, а canonical full — только test/*.test.cjs.
Все128 ожидаемых основных файлов присутствовали; пропуска продуктовых tests не было.
Исправлена только проверка каталога: отдельные browser-файлы должны реально
существовать, основной full по-прежнему точно совпадает со списком test/ и целиком
покрывается scoped-профилями. Неизвестные файлы по-прежнему вызывают отказ.

`node --test test/test-launcher.test.cjs` после fix:5/5 PASS, exit0,
включая shared artifact, child processes, failure propagation и zero-test refusal.
Полный часовой прогон повторно не запускали: runtime и набор запуска не менялись.
Исходный failed baseline сохранён как failed, не переписан в894/894.

**Вывод:** выявленное несоответствие тестовой инфраструктуры устранено;
других падений в выполненном наборе нет. Кандидат передаётся на статическое review,
а не объявляется готовым к production. Dependency findings ниже остаются открытыми.

## Дополнительные проверки

- Browser35/35 PASS, exit0: шесть `web/*.test.cjs` в изолированном checkout
  кандидата; Solidity artifacts взяты из того же review-runner compile.
- Python39/39 PASS: short-model6, short-economy5, short-sweep4, short-luck4,
  short-legacy11, farming-model9. Команды `python test/<name>.test.py` в том же
  checkout; stdout показал OK для каждого набора. Отдельный raw log не сохранялся.
- Runtime размеры по canonical compile: Short22738, Monthly19671, vault8496,
  drand10957, LocalPonsCollector12983, BuyPolicySource1313 bytes.
  Это размеры артефактов, не новая оценка gas или квалификация боевого deployment.

Известный сохранённый Alchemy URL/ключ не найден в отслеживаемых git-файлах.
Это адресная проверка конкретного секрета, не универсальный secrets audit.
Slither/внешний профессиональный аудит этим пакетом не выполнялись.

## Зависимости: отдельное открытое замечание

`npm audit --json` на lockfile кандидата:20 dependency findings — high8,
moderate2,low10,critical0; exit1. Это число затронутых пакетов, не20 независимых
уязвимостей в контрактах. [JSON audit](evidence/DEPENDENCY_AUDIT_2026-10-03.json) сохранён без изменений содержания.

Пути high findings: Hardhat → undici/busboy, adm-zip, Mocha →
serialize-javascript/minimatch/brace-expansion; solc → tmp. Часть fixAvailable
предлагает Hardhat3 (major migration), которую здесь не выполняли.
Все direct packages в package.json помечены devDependencies, но одного этого
недостаточно, чтобы объявить риск отсутствующим. Загрузка текущих API и Pons
automation через require не загрузила эти toolchain modules; ethers загрузился.
Это проверка import graph на данном входе, не полный анализ достижимости.

В рамках тестового baseline зависимости не обновлялись. Перед боевой упаковкой
нужно отделить runtime от build/test-инструментов и проверить достижимость/обновления
оставшихся advisory. GPT должен оценить этот конкретный риск, не предлагать
автоматический `npm audit fix --force` или масштабную переделку ради счётчика.

## Что обязательно перед боевым этапом

После baseline и review — отдельный план переноса: реальные manifest/runtime pins,
адреса/роли, signer и хранение ключа, network timing/finality/RPC history,
сбор доступных комиссий (включая ручной fallback), сервисы/backup и контролируемый
первый запуск. Local-only guards не удалять как «последний штрих» к тестам.
Реальный Pons operator остаётся внешней зависимостью; pending TOKEN не призовой фонд.

Не требуют нового большого тестового пакета сами по себе: новое хранилище,
все кошельки/агрегаторы мира, автоматический archive failover, межсетевой выпуск.
Выявленная конкретная ошибка учёта/выплаты всегда разбирается до завершения проверки.
