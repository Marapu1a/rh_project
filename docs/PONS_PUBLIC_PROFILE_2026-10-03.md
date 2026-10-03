# Pons: проверка публичной конфигурации

Статус 03.10.2026: реализован read-only инспектор, **публичный исполнитель не реализован**.
Это промежуточная часть G04/G01, не разрешение deployment или отправок.

## Что сделано

`scripts/pons-public-profile.cjs` проверяет профиль `pons-public-profile-v1`,
привязанный через `configHash` к точному config. Operational choices и timing
задаются явно: инспектор не принимает наблюдаемое состояние за желаемое.
Используются существующие проверки Pons routes, FINALIZED_CHECKPOINT и genesis.

На одной наблюдаемой высоте проверяются chain4663, runtime hashes, связи vault /
controllers / drand / collector / escrow, publisher, owner и pendingOwner,
доли90/5/5, USDG decimals, genesis, notice, gas ceilings и интервалы.
Проверяются также clock/finality, каноничность anchors и повторно hash наблюдаемой
высоты. Ошибки RPC закрывают проверку; URL/текст RPC-ошибки в отчёт не попадают.
Недостаток газа здесь не трактуется как постоянный запрет: баланс не проверяется.

Старый `deployment-admission.cjs` имеет Infinity-specific `source` bindings.
Новый инспектор их не подменяет; общие operational checks переиспользуются отдельно.
Профиль не изменяет конфигурацию, журналы, контракты или продуктовые правила.

## Запуск

В окружении задать `RH_RPC_URL` (HTTPS, секрет не передавать аргументом), затем:

```text
node scripts/inspect-pons-public.cjs CONFIG.json PROFILE.json
```

Код возврата0 означает только `status: matched`; `publicExecution` и
`authorizationToFreeze` всегда false. Конкретного публичного config/profile пока нет.
Rehearsal config допустим как вход структурной проверки, но не становится от этого
production deployment. Профиль без независимой сверки исходников и runtime pins
не удостоверяет безопасность кода.

## Проверки и evidence

- `node --test test/pons-public-profile.test.cjs`: **5/5 PASS**. Модель RPC:
  правильная конфигурация; неверные chain/runtime/доли/owner/hook/время;
  недоступность чтения; config drift; отсутствие finality; неканоничный anchor/head;
  закрытый CLI и отсутствие утечки URL. Это не EVM deployment нового профиля.
- Тест зарегистрирован в full и адресной группе `pons-public-profile`.
- `node --test test/operational-profile.test.cjs`: **3/3 PASS**, существующие EVM
  проверки общей operational логики, включая drain при изменении роли. Это соседний
  Infinity harness, не сквозной Pons deployment нового инспектора.
- `node --test test/test-launcher.test.cjs`: **5/5 PASS**, проверка каталога/launcher.
  Итого13 адресных tests; полный набор не запускался.
- `test/fixtures/pons-public-config.json` — сохранённый config локального fork
  прогона PONS_JOINT_REHEARSAL; все deployment-адреса и anchors относятся к стенду.
  Путь index заменён синтетическим. Не использовать для боевого запуска.
- `test/fixtures/pons-public-venue-code.json` — публичный runtime router/manager/
  Permit2, прочитанный03.10 через сохранённый RPC; каждый hash совпал с существующим
  route pin. Это статическая тестовая fixture, не live readiness Pons.
- Логи проверок: `.local/logs/pons-public-profile-tests.log`,
  `.local/logs/pons-public-operational-neighbor.log` (локальные, не в git).

## Следующий пакет

Публичный sender с отдельным явным режимом и адресной репетицией отказов:
проверка непосредственно перед отправкой, signer/config identity, сохранение
intent до broadcast, reconciliation неизвестного результата без повторной оплаты.
Funding/new-freeze admission необходимо отделить от drain существующих обязательств.
Не переносить Hardhat instance bypass в production и не добавлять второй учёт.
Затем полный проход нового режима на тестовом контуре; сервер и реальные отправки
остаются отдельным шагом. LocalPonsCollector пока помечен прототипом, отдельная
квалификация deployment по-прежнему нужна.
