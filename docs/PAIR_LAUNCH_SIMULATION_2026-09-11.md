# Успешная read-only симуляция TOKEN/USDG

Проверено 2026-09-11, 13:52 UTC, блок `0x3983471` Robinhood mainnet (chain ID 4663). Закрывает неудачную симуляцию из `PAIR_FEE_PATH_2026-09-11.md`.

## Результат

`launchV2Token` через действующий proxy успешно проходит eth_call с одним пулом TOKEN/USDG (allocation 100%), fee-sharing mode 1 и существующим контрактом в роли получателя 100% creator share. Протокольная доля в эти 100% не входит.

| Сценарий | Результат |
|---|---|
| Получатель — существующий social fee escrow, developer buy 0,00001 ETH | Успешный eth_call, ожидаемый token address |
| Получатель — адрес creator, developer buy 0,00001 ETH | Успешный eth_call, тот же ожидаемый token address |
| Получатель — существующий social fee escrow, developer buy 0 | Успешный eth_call, тот же ожидаемый token address |
| Первый сценарий, заменён только валидный salt на salt предыдущего неудачного теста | `InvalidLaunch()` / `0x6de3e846` |

Причина прежнего отказа воспроизведена контрольным тестом: прежний произвольный salt не подходит для запуска. Нужен creator-bound CREATE2 salt, дающий допустимый адрес токена. В успешном тесте адрес оканчивается на `5555` и численно больше адреса USDG, как предусматривает алгоритм подготовки адреса frontend. Контроль не устанавливает, какая именно внутренняя проверка salt/address выбрасывает ошибку — трассировка недоступна.

На блоке проверки EIP-1967 implementation остаётся `0x8000b64b62837a1511e302c62354e1bc39b5641a`, proxy `0x8660a7f019c7943b0b0a91b8e39aff3b6db6ae62`.

## Параметры успешного теста

- Factory: `0xf197e48339ea495e458bf5c51984d6cc6f48c1d7` — native release из frontend с coordinator `0x5904d5e72c326aeea44e2780d3f8be395a82403d`.
- Creator/from: `0xb1bf6346cd6f7a8f52a709a4265a00d969bd531d`, взят из исторического launch. eth_call не требует владения этим адресом; ключи не использовались.
- Salt: `0x0000000000000000000000000000000000000000000000000000002f2c72c33e`.
- Predicted/returned token: `0xfb3a758654545a2be8ac301b3d2ea21db6f35555`. Prediction подтверждён getter фабрики, затем совпал с результатом launch.
- Quote: USDG `0x5fc5360d0400a0fd4f2af552add042d716f1d168`, weight 10000 bps.
- Fee recipient: `0x766631e1a3ff2b460a34df221cff875a4bd967d0`. Наличие bytecode проверено. Это существующий escrow, не наш будущий FeeRouter.
- `modeConfiguration = abi.encode(address[] recipients, uint16[] shares)` с одним recipient и share 10000; внешние `feeRecipients` и `feeSharesBps` — пустые массивы, как в актуальном frontend builder.
- Launch fee из getter: 0,0005 ETH. Value с buy: 0,00051 ETH; без buy: 0,0005 ETH.
- Buy-сценарий: aggregate input 0,00001 ETH, один leg USDG с тем же input; minimum output 1 raw TOKEN. Это намеренно мягкий предел для проверки исполнимости, не параметры реальной отправки.
- No-buy: input 0, minimum 0, allocations пустой массив, developerBuyRecipient нулевой адрес.
- Name, symbol, URI и metadataHash сохранены из исторического примера; это не подготовленные метаданные нашего проекта.
- Deadline: timestamp выбранного блока + 1200 секунд.

Оценка газа buy-сценария: 4 403 669 gas на этом блоке. Это не окончательная цена запуска: оплачиваемая стоимость зависит от актуальных условий сети.

## Что изменилось в выводах

1. Single-pool TOKEN/USDG с получателем-контрактом теперь подтверждён не только исторической транзакцией, но и новым eth_call на текущем состоянии.
2. Нулевой developer buy проходит контракт. При этом исследованный native frontend требует минимум 0,00001 ETH (`c9`), поэтому запуск без buy через штатный интерфейс не подтверждён.
3. API `/api/v5-v2/native-fee/consumer-live` во время проверки вернул HTTP 503 `native_fee_consumer_attestation_unavailable`. Это помеха штатному frontend preflight, но не доказательство невозможности прямого вызова контракта: RPC simulation успешна.
4. Предыдущий вывод о невозможности определить рабочий путь запуска уточнён: адрес из native factory совпадает с результатом действующего launchpad. Внутренние calls coordinator не трассировались.

## Предел проверки и следующий этап

Проверены успешное завершение launch и возврат адреса. eth_call не сохраняет созданные контракты и не возвращает receipt/logs; содержимое новых vault/pool после исполнения здесь не исследовано. Проверка eth_getCode после вызовов вернула `0x`: токен не развёрнут. Подписей, broadcast и расходов не было.

Права и поведение нашего собственного FeeRouter пока не проверены. Исторический escrow уже умеет получать fees, но переносить его свойства на новый контракт нельзя. Следующий этап — описать интерфейс FeeRouter и проверить полный collect → claim → FeeRouter → PromoVault с сохранением состояния на локальном fork или совместимой тестовой среде. До отправки реального launch нужны собственные creator/salt/metadata, актуальная конфигурация и разумные min outputs.

## Воспроизведение

Из корня workspace:

```powershell
python -m pip install --target research/_deps -r research/simulation-requirements.txt
python research/simulate_native_launch.py
```

Скрипт содержит allowlist только read-only RPC методов; не умеет подписывать и отправлять транзакции. Получает новый блок и deadline, сохраняет параметры и ответы в `research/native-launch-corrected.json` (перезаписывает этот файл). После изменения состояния сети результат может отличаться. Исходный исторический payload берётся из `research/current-usdg-launch-simulation.json`; decode/encode проверяется побайтовым совпадением.

Загруженный `research/vanity-worker.js` использовался только для чтения алгоритма. Remote JavaScript не исполнялся.

Evidence: `research/native-launch-corrected.json`, `research/native-consumer-live.json`, `research/simulate_native_launch.py`, `research/vanity-worker.js`.
