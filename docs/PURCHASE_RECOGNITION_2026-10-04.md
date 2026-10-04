# Позднее начисление: проверка04.10.2026

База `7d61c03` + изменения этого пакета. Production/VPS не изменялись;
публичные транзакции не отправлялись. [Устройство и ограничения](PURCHASE_RECOGNITION.md).

## Результат

Полный локальный путь: сохранённая неподдержанная покупка → read-only сборщик
доказательств → commitment → replay carry/Short/Monthly → durable evidence →
независимая проверка API → ожидание/начисление в браузере.

Сохранены исходная позиция покупки и отдельная позиция начисления. Повторный
пакет не дублирует билеты. Старый Short после consume и frozen Monthly сохраняют
свои snapshots. При активации новых правил обоих типов поздние entries принадлежат
новым эпохам. Source имеет неизменяемого publisher и24ч задержку от deployment.

Важная граница: экономическая история в сквозном replay — captured receipts;
события confirmation/freeze/consume синтетические. Сам новый Solidity source
отдельно развёрнут и исполнен в локальном Hardhat, включая раннюю/чужую публикацию,
лимит50 и повторный hash. Это не полный боевой цикл с настоящим RNG/выплатой.

## Проверки

| Команда | Результат и предел |
|---|---|
| `node scripts/test-launcher.cjs --profile purchase-recognition` | **54/54 PASS**, адресный профиль, не full. Лог `.local/logs/test-run-liykGw/result.json` |
| `node --test web/wallet.test.cjs` | **14/14 PASS**, реальный Chromium, API/provider в браузерных сценариях синтетические |
| `node --test test/purchase-recognition-source.test.cjs test/attempt-lifecycle.test.cjs test/verified-buy-replay.test.cjs test/pons-policy-indexer.test.cjs test/project-history.test.cjs` | **32/32 PASS** на промежуточном пакете; перекрывается с профильным прогоном, не прибавлять к нему |
| `node --test --test-name-pattern="profile catalog" test/test-launcher.test.cjs` | **1/1 PASS**, каталог новых test files |

Проверены: missing/corrupt bundle, другой source/runtime/publisher, подмена
trace/recipient/branch, duplicate purchase/delivery, reorg original/confirmation,
restart, compaction, исходный carry, receipt/call provenance, v4 epochs,
независимая API проверка trust и отсутствие сырых proof в ответе.
Persistent index при недоступном/повреждённом commitment сохраняет последний
хороший snapshot и выставляет waiting.

Промежуточный запуск `--match purchase-recognition` не совпал с именами кейсов:
launcher правильно завершился `No tests executed`. Он не считается проверкой;
после него выполнен указанный выше профиль без фильтра.

## Реальные покупки, без публичной отправки

Через QuickNode повторно прочитаны receipts, callTracer с логами и код
исполнителей на блоке покупки и его родителе. Новый collector/verifier подтвердил
**28/28** ранее выделенных форм:27 ETH и1 USDG. Это read-only подтверждение
evidence, а не событие начисления в сети.

- Финальный bundle: **926536 bytes**, примерно905KiB; повторяющийся bytecode
  заменён hashes до/после блока.
- Commitment digest: `0x83002bf7f793beb7b0c6594d7f2d2247b8effdc06317c4e529d50cdea9823f7c`.
- Взята сохранённая история проекта до79518814. Добавлено **синтетическое**
  событие подтверждения; локальный replay дал14 ticket pairs вместо0,
  с остатками carry по кошелькам.28 записей confirmed,24 остаются pending.
- В этом сохранённом срезе нет реальных frozen draws; их неизменность проверена
  отдельными synthetic lifecycle сценариями, а не заявлена по пустому списку.
- Replay этого среза: около216ms на текущем компьютере; это единичный замер,
  не нагрузочный SLA и не экстраполяция до миллионов покупок.

Сводное evidence: [JSON](evidence/PURCHASE_RECOGNITION_2026-10-04.json).
Локальные bundles/results/replay: `.local/logs/recognition-live-probe-v2/`.
Адрес source в этом плане синтетический: **план не предназначен для broadcast**.
Фикстура runtime-codes содержит публичный bytecode, не credentials.

## Следующий отдельный этап

Review нового кода и модели RPC-доверия → объявление правила/24ч → реальный source
и согласованный trust/index/API/coordinator → проверка перед публикацией первого
пакета. Финансовая автоматика остаётся выключенной. Ещё24 неподдержанных покупки
нужно разбирать отдельно; новый механизм сохраняет им путь позднего подтверждения,
но не превращает неизвестный маршрут в автоматически допустимый.
