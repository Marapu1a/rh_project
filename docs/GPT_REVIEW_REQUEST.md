# GPT: позднее подтверждение — исправления после review

04.10.2026. Предыдущий ответ на27108e6 принят и сохранён в
[GPT_REVIEW_RESPONSE](GPT_REVIEW_RESPONSE.md). Проверь текущий HEAD, назови его.
[Разбор и фактические границы](PURCHASE_RECOGNITION_REVIEW_2026-10-04.md).
Ничего не развёрнуто в production. Старый bloom-запрос —
[в архиве](archive/GPT_REVIEW_REQUEST_PRE_RECOGNITION_2026-10-04.md).

Новые изменения узкие: prepare-purchase-recognition.cjs и regression tests.
Сверь:

1. Дубли hash в разном регистре и повреждённая история отклоняются до выдачи плана.
2. История и целый будущий bundle проходят тот же BUY/lifecycle replay; source
   runtime/instance/publisher/availableAt/published и confirm проверяются read-only.
   Может ли preparer штатно выдать пакет, который остановит reader после публикации?
3. Checksum/config identity/admission/freshness CLI; canonical header и финальная
   перепроверка ветки. Где требуется повторный preflight непосредственно перед подписью?
4. Документы явно различают consistency replay, доверие evidence и независимый
   trace-аудит. Последний НЕ выполнен: Alchemy Free закрывает метод, public RPC его
   не предоставил. Не выдаём probe одной покупки за проверку28 или полноты диапазона.
5. План учитывает отдельное время публичного объявления и доступность bundle.
   Source delay от deployment не заменяет эти условия.

15/15 адресных tests — запуск Codex, не твой и не полный suite. Проверяй статически;
не запускай tests/build/fork, не меняй код и не отправляй транзакции или сообщения.
Ответ — docs/GPT_REVIEW_RESPONSE.md. Раздели воспроизводимые дефекты, обязательные
операционные действия и улучшения на будущее. Сохранить тестовый → боевой этап.
