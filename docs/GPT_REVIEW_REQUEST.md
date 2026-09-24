# GPT: review Permit2 BUY adapter и границы активации

24.09.2026. Проверь текущий пакет относительно e271043. Ответ перезапиши в
GPT_REVIEW_RESPONSE.md; код самостоятельно не меняй. Предыдущий scheduler пакет
завершён; его границы описаны в LOCAL_PROMO_SCHEDULER.md.

## Что сделали

Промо начисляет attempts за подтверждённую покупку зарегистрированного payer=recipient.
Не обещаем охват всех routes, в сомнительных случаях не начисляем. Prize math не меняем.
После успешного controlled fork добавлен один adapter rh-ur-0a10-060b0e-v1:
PermitSingle + V4 exact-input single USDG BUY через закреплённый router.
Нет candidate registry, arbitrary plugins, новых контрактов или автоматической
активации в старых policies. Typed publication/source уже существовали.

Прочитай актуальный раздел [DIRECT_BUY_REPLAY](DIRECT_BUY_REPLAY.md#permit2-buy-adapter-24092026),
затем diff scripts/direct-buy.cjs, buy-policy-format.cjs, replay-direct-buy.cjs и тесты.
Fork evidence: research/permit-buy-fork-positive-2026-09-24.json; ограничения его
получения в ROUTE_RESEARCH_2026-09-24.md. Новый fork в этом шаге не запускали.

## На что обратить внимание

1. Adapter выбирается по commands + actions; только exact 0x0a10 без ALLOW_REVERT
   и reserved flags. Canonical execute, permit и swap inputs.
2. Permit token=quote, spender=router, allowance >= actual input. Gross берётся
   из прежнего Swap/settlement/delivery, не allowance или maximum calldata amount.
3. Signature/nonce/deadline проверяет actual Permit2 execution. Мы не дублируем EOA
   recovery: trusted success receipt и обязательный успех обеих commands — основание.
   Поддельный JSON receipt offline decoder не может превратить в chain evidence.
4. Router hash pinned; Permit2 address/hash — фиксированная dependency версии adapter.
   RPC reader сверяет её только при активном cutoff. End-block runtime check не доказывает
   неизменность внешнего кода за всю историю. Старые manifest hashes не меняются.
5. prepare/publish/admission используют новый id и future activation. Synthetic replay
   сохраняет carry и старые frozen hashes. Production notice/authority ещё не назначены.

## Проверки

46/46 BUY/lifecycle/monthly, 4.90 s без compile. Ещё 2/2 actual local EVM publication,
18.91 s с compile. Точные команды и log paths — в документе модуля. Saved real fork
BUY — положительный execution sample; malformed/empty-signature/receipt mutations —
offline consistency vectors, не свежие отрицательные EVM swap executions.
Full suite/public sends не запускались. Призовая custody, contracts, RNG не менялись.
Финально сохранён прежний COMMAND_SEQUENCE до opt-in: не меняем исторические reasons
и ledger hashes. После этого повторена затронутая выборка 7/7, 0.56 s (не суммировать).

## Вопросы

- Нет ли обхода command/action gate или ошибочного attribution в этой узкой форме?
- Достаточно ли runtime binding и обязательного permit success в принятых границах
  reader; есть ли конкретный воспроизводимый контрпример?
- Нет ли регрессии cutoff/admission и старых snapshots при добавлении id?
- Какие замечания действительно блокируют пакет, а какие относятся к deployment?

Не предлагай охват всех routers заранее. После review возвращаемся к оставшейся
release-интеграции ROADMAP §4; новые research-ветки — только с конкретной причиной.
