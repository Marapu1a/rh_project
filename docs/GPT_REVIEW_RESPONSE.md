# Постоянный ответ GPT

Обновлено: 24.09.2026. Независимое review `8d1973d` относительно `e271043`; это мнение, не автоматическое задание. При следующем обращении файл перезаписывается.

Прочитал decoder, policy format/admission, RPC scan, сохранённую fork-квитанцию и relevant router Dispatcher, тесты и текущие границы модуля. Самостоятельно повторил адресные проверки: pure BUY **7/7**, EVM публикация двух adapter ids в отдельном чистом worktree **2/2** (exit 0, включая компиляцию). Полный набор, новый fork и public sends не запускал. Untracked аудит не трогал.

## Вердикт

**Блокирующего дефекта в заявленной узкой форме не нашёл.** Выбор идёт по точным `commands=0x0a10` и `actions=0x060b0e`, с ровно двумя inputs; флаги ALLOW_REVERT, перестановки, дополнительные команды и иной action не проходят. Calldata внешнего execute, PermitSingle и swap декодируются с обратной канонической кодировкой. Новый id нужен в policy и должен быть активен на блоке Swap; до opt-in прежний `COMMAND_SEQUENCE` сохранён. Старые versions/manifest hashes и frozen snapshots синтетический replay не меняет.

Payer получается из `tx.from` именно для закреплённой direct-router формы; Dispatcher передаёт `msgSender()` в Permit2, а settlement c `payerIsUser=true` оплачивает тот же caller. Recipient обязан совпасть с payer, либо указан router sentinel. Gross берётся из отрицательного USDG delta в единственном Swap и подтверждается ровно одним USDG Transfer payer→manager и одним TOKEN Transfer manager→recipient после Swap. Permit amount только нижняя граница фактического расхода: больший allowance не увеличивает attempts. Кандидата с чужим pool, подарком, неверной оплатой или дополнительными TOKEN/USDG Transfer decoder не засчитывает.

Утверждение об успешном permit допустимо **лишь при настоящей успешной квитанции проверенного исполнения**: exact `0x0a` не несёт ALLOW_REVERT, и сохранённый Dispatcher вызывает Permit2 с owner `msgSender()`. Поэтому отдельно восстанавливать EOA подпись в decoder не требуется. Pure `decodeTransaction` сам по себе доверяет переданным JSON tx/receipt; он не превращает синтетические мутации в chain evidence. Нужны полная ветка replay и надёжный RPC/provenance. Положительный BUY здесь действительно был исполнен на controlled local fork с искусственным балансом кошелька, а не на публичном deployment нашего TOKEN. Отрицательные подписи/nonce на EVM в этом пакете не гоняли.

Binding имеет точные границы: router runtime hash жёстко задан, Permit2 address/hash привязаны к версии adapter и проверяются RPC reader на активном cutoff. Проверка на конечном блоке не доказывает неизменность кода во всех промежуточных блоках; это общая оставшаяся доверенная граница reader, а не найденный обход данного diff. Synthetic ветка подтверждает carry и старый frozen hash, EVM тест подтверждает future activation/полноту source; они ещё не составляют один сквозной production прогон BUY→admission→scheduler.

## Дальше

Пакет можно считать завершённым в его локальной области. Возвращение к release-интеграции из ROADMAP §4 разумнее нового route research. Перед публичным применением потребуется закрепить конкретный deployment и политику publisher/notice/finality, проверить связанные BUY→admission→dataset на выбранной сети и сохранить gate права публикации draw; без этого успех adapter тестов не равен готовности к релизу.
