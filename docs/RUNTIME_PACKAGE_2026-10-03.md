# Изолированная runtime-сборка и общий config

03.10.2026. B2: подготовлен проверенный формат поставки; public executor не реализован
этим пакетом. Никаких deployment, транзакций, переноса состояния и снятия guards.

## Что сделано

`build-runtime.cjs NEW_DIRECTORY` выполняет свежую компиляцию (test artifact env
запрещён), не перезаписывает существующий release, кладёт артефакт и заменяет
compile.cjs внутри поставки строгим загрузчиком. SHA256 встроен в загрузчик;
каждое чтение проверяет bytes. Нет fallback в solc, sourceOverrides запрещены.
Изменение артефакта требует новой сборки. Хеш — контроль целостности относительно
доверенного build, не подпись и не доказательство соответствия deployed bytecode.

В release.json — hash каждого поставляемого файла. В build окружении по-прежнему
нужен solc. Ethers6.17.0 перенесён в dependencies без обновления версий lockfile.
Установка release: `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`.
Hardhat/solc/Playwright и уязвимые toolchain chains не устанавливаются.
Старые20 audit findings build/test окружения этим не исправлены.

HK становится web/index.html. Transparency,404,assets,claim,overview,vendor сохранены;
purchase-demo и web/*.test.cjs не копируются. Конфиги, состояния, RPC URL, ключи,
контракты-исходники и test fixtures не копируются. Scripts пока копируются целиком
ради существующих dynamic workers; наличие research/build скрипта не делает его
поддерживаемым entrypoint. Он может требовать отсутствующий dev toolchain.
Generated package start — только read-only API standby.

`pons-deployment-config.cjs CONFIG` валидирует существующий rehearsal config и
возвращает automation + schedulerConfig + indexConfig через прежние builders,
sourceHash и site preview descriptor (actions:null). Исходник не мутируется;
identity существующих журналов не меняется. Индексатор/API используют indexConfig.
Это общий экспорт существующего тестового deployment, НЕ готовый production
manifest или публичный site-actions config. Не подставляет реальные адреса,
не выдаёт chain4663 за permission на отправки и не включает Claim.

## Проверки

- `node --test test/runtime-artifact.test.cjs test/shared-index-config.test.cjs test/test-launcher.test.cjs`
  —8/8 PASS; `.local/logs/runtime-package-tests.log`. Профиль runtime-package добавлен.
- `node scripts/build-runtime.cjs C:/Temp/qianqi-runtime-b2-final` — свежая сборка.
- В этой папке `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` —9 packages.
- `node scripts/check-runtime.cjs D:/sites/rh_project/.local/logs/pons-cycle-MCI0et/config.json`
  —PASS. Реальный сохранённый тестовый snapshot прочитан API через worker, состояние
  stale и1 награда проверяемого кошелька; сайт HTTP200, transparency200, demo404,
  site-actions null. Общий config согласован и независим от исходного объекта.
  Лог `.local/logs/runtime-final-smoke.log`. Никакого RPC и новых отправок.
- Strict loader вызван реально; missing/tampered bytes и options отвергнуты,
  test artifact env не подменяет release. Файл восстановлен, все hashes release
  перепроверены. Результат сохранён в evidence, stdout отдельного fault log не имеет.
- `npm audit --omit=dev --json` в первой идентичной по lockfile изолированной
  установке:0 advisories, exit0. Это результат на03.10, не гарантия безопасности.
  `.local/logs/runtime-dependency-audit.json`.

[Evidence](evidence/RUNTIME_PACKAGE_2026-10-03.json). Полный suite не повторялся:
призовая логика и исходный compile.cjs не изменены; тесты направлены на упаковку,
целостность и существующий config. Это не полноценный новый coordinator/fork cycle.

## Следующий обязательный стык

Публичный Pons executor до сих пор local-fork only. До сервисного deployment нужен
отдельный публичный профиль: manifest/pins/роли, реальные timing/finality,
signer и защита каждой отправки, API/site-actions из того же проверенного deployment.
Не снимать localhost/Hardhat guards механически. После этого — сервисы и репетиция
реальной поставки. Текущая сборка готова для изолированных проверок этого шага.
