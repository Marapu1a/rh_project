# Pons: покупки на кривой

Обновление01.10: curve-only профиль сохранён; добавлен отдельный [объединённый curve+v4 профиль](PONS_V4_BUY.md). Упоминания неподдержанного v4 ниже относятся к исходному curve-only профилю.

01.10.2026. Локальный адаптер `rh-pons-direct-curve-v1`; публичный запуск не разрешает.

## Учёт

- Только прямой `curve.buy(quoteIn,minTokensOut,recipient)`: отправитель, плательщик
  и получатель совпадают. Оплата USDG, без native value.
- Calldata, CurveBuy и переводы USDG/TOKEN сверяются вместе. При частичном исполнении
  на graduation учитывается списание минус возврат, подтверждённый Transfer и
  CurveBuyRefunded. Комиссии входят в списание один раз.
- Порог остаётся 100 номинальных USDG. Покупка 101 даёт одну entry и остаток 1;
  entry открывает одну Short и одну Monthly попытку. 60 + 40 также дают entry.
- SELL и обычные переводы не начисляют entry. Повторная доставка блока не удваивает
  результат; смена канонической ветки требует полного replay от anchor.
- Незнакомый маршрут, иной получатель, неоднозначные переводы или provenance
  не принимаются. Developer Buy внутри launch, wrappers и v4 пока не поддержаны.

## Код и границы

[Декодер](../scripts/pons-curve-buy.cjs) подключён к
[replay](../scripts/direct-buy.cjs) и [RPC reader](../scripts/replay-direct-buy.cjs).
Reader получает полные блоки и receipts, проверяет runtime hashes на каждом блоке
и связи factory/curve/token/quote/hook. Это не полная проверка исходников и не
production admission. USDG proxy implementation отдельно этим адаптером не проверяется.
Сохранённые evidence требуют доверенного происхождения: offline replay не обращается к RPC.

Учёт использует существующий attempt lifecycle. Он не доказывает проведение
розыгрыша, фиксацию root, RNG или выплату. Постоянный сервис/public policy пока не
переключены на Pons. PAIR сохранён. Следующий пакет — v4 BUY после graduation.

## Проверки

01.10: `node --test test/pons-curve-buy.test.cjs test/infinity-buy.test.cjs test/direct-buy.test.cjs test/attempt-lifecycle.test.cjs`
— 49/49 PASS, адресный набор. Эквивалентная группа: `--profile pons-buy`.
Лог: `.local/logs/pons-buy-tests.txt`.

Fork runner: `node scripts/pons-collector-fork.cjs <new-output.json> --buys`.
Использует локальные impersonation и synthetic USDG; upstream proxy read-only.
Сохраняет исходные блоки/receipts, ledger и открытые попытки для покупки101 и
graduation. V4 swaps в этом runner проверяют финансирование, не начисление entry.

01.10: `node scripts/pons-collector-fork.cjs .local/logs/pons-buy-fork-20261001-c.json --buys`
— COLLECTOR_MANUAL_FORK_PASSED,27 транзакционных шагов. Anchor77265497,
hash `0x377d8606389cc690f14e48cca42820477ae886545004de8eeb4297b147aee4cc`.
Первый BUY101 → по1 открытой Short/Monthly, carry1.
Graduation: requested15000, net8377.328733, refund6622.671267 USDG;
итого после двух покупок84 entry, carry78.328733. SELL не начислен.
Повторная доставка всего диапазона сохраняет hash ledger.
В том же прогоне PromoVault получил289.338015USDG; conversion использовал локальную
имперсонацию Pons operator и не подтверждает доступность его публичного сервиса.
Первый запуск остановился из-за пропущенного toBlock в runner (исправлено), второй —
из-за отставания upstream на один блок. Теперь anchor выбирается latest−10 с проверкой hash.
Лог успешного запуска: `.local/logs/pons-buy-fork-run-c.txt`. Все sends локальные.
