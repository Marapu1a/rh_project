# Legacy-транзакция остановила индексатор — 04.10.2026

## Причина и исправление

Мониторинг выявил повторные ошибки после сохранённых13100 блоков (head79390959).
На отдельной копии состояния воспроизведён TypeError в direct-buy: BigInt(tx.chainId).
Транзакция0x0efc01cb27c4395a4aa56c8877840615c03943bc5ae2f83cfe2fec7303e55ae7
имеет type0/v28 без chainId. Это допустимый unprotected legacy формат:
https://eips.ethereum.org/EIPS/eip-155 . Нельзя подставлять ему chainId4663.

Новый transaction-chain.cjs восстанавливает signed transaction, сверяет hash/from
для legacy без chainId (или chainId0). Typed без chainId, неверный v, изменённый
hash/sender и чужой chainId не проходят. Проверки receipt/канонической ветки и
допуска покупки остаются прежними. Это не расширение торговых маршрутов.

## Проверки и эксплуатация

- node --test test/pons-receipt-scan.test.cjs:11/11 PASS.
- npm run test:group -- --profile pons-receipt-scan:135 продуктовых tests PASS;
  первый запуск выявил ошибку метаданных профиля (compile:false при фактической
  компиляции). Исправлено на true; повторный запуск:135/135 PASS, exitCode0, одна компиляция.
- Отдельная копия реального состояния:1000 блоков за50.15s, head79391959,
  removedBlocks0. Файл .local/logs/legacy-live-probe.log. Боевой snapshot не заменялся.
- Сервис был остановлен на время диагностики, чтобы не повторять неуспешные проходы.
  Новый release /opt/qianqi/releases/indexer-legacy-20261004 проверен по307 hashes;
  прежний сохранён. Сервис перезапущен с прежним /var/lib/qianqi-public/index.json.
- До остановки RAM около200MiB, свободный диск34GiB: причина не в нехватке ресурсов.
- Финансовая автоматика и публичное переключение API остаются выключенными.
  getLogs range limit, долгосрочный рост истории и догон остаются открытыми задачами.

Локальные подробности: .local/logs/legacy-chain-tests.log,
.local/logs/legacy-neighbors-final.log. Полный набор проекта не запускался.
Runtime собран до исправления метаданных test-profile; production код идентичен,
различие касается только локального запуска проверок.
