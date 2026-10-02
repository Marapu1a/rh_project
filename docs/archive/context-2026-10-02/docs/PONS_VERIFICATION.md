> Исторический снимок до уборки 02.10.2026. Не текущий план. [Актуальный контекст](../../../CURRENT_CONTEXT.md).

# Pons: проверка исходников и действующей автоматики

30.09.2026. По решению владельца перенос приостановлен до прояснения внешних
границ. Только read-only RPC, локальная компиляция и eth_call; public sends нет.

## Подтверждено

- Snapshot block 76638568, hash
  `0xed2890496d8c80fafd1d72848be43deae855e8ae1703c03efc5d5c7f3597467f`:
  factory/hook/escrow runtime hashes совпадают с предыдущей fork-репетицией.
- Hook `0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044` воспроизведён из
  `ponsdotdev/pons-labs` commit `b51431f7d5242fc5414a7da7d3659ad3bc749eb7`:
  solc 0.8.35, optimizer200, viaIR=true, EVM cancun. Размер15167 bytes.
  Исполняемый runtime совпал полностью после удаления CBOR metadata и исключения
  immutable slots из сравнения. Это не full metadata/source verification.
- Все immutable slots содержат один из двух ожидаемых адресов: feeEscrow
  `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e`, poolManager
  `0x8366a39CC670B4001A1121B8F6A443A643e40951`; getters возвращают те же адреса.
  Компилятор скачан из ethereum/solc-bin, keccak совпал с published list.json.
- В блоках76631780–76641780:76 PoolFeesSwept,76 транзакций,76 разных poolId.
  Проверены receipts пяти последних выбранных транзакций: status1, вызовы от
  `0x49BbF2b70955Fb3a106e084D4BFDa92d334573d2` к оператору
  `0xa1018c1D9655292A2dE0F7dEa9a0F848EaA8cA83`.
- Оператор — контракт (17929 bytes), не EOA. Его nonce1 не измеряет активность.
- [Реальная USDG-конвертация](https://robinhoodchain.blockscout.com/tx/0x07664000987d99b4ebcddd6cbb0eba414fedda11e8c74efb69397bd4b8fd6c67):
  30.09 15:58:21 UTC, Swap от hook с TOKEN→USDG, получено9.644785USDG.
  В том же receipt переводы USDG hook→escrow и PoolFeesSwept:
  creator15.976329USDG, protocol6.846997USDG, buyback0.
  Распределённая сумма включает ранее накопленные quote fees, не только этот swap.

## Не закрыто

1. Фабрика из актуального GitHub не компилируется: строка749 вызывает
   `PonsV2BondingCurve.exemptFromSnipeTax`, отсутствующую в опубликованном curve.
   Повторная загрузка main подтвердила тот же commit и расхождение. Исправлять
   чужой код догадками ради объявления match нельзя. Это дефект воспроизводимости
   опубликованного комплекта, а не доказательство ошибки deployed factory.
2. Реализации escrow и operator в этом checkout не найдены. Полное соответствие
   графа factory/deployer/curve/token/locker/escrow/operator ещё не установлено.
3. Успехи в коротком окне подтверждают деятельность, не SLA/долгосрочную надёжность.
   Полная история failed transactions/задержек не получена. Blockscout API403,
   IPFS gateway429/timeouts, Sourcify hook full/partial404; большие RPC logs queries
   timeout/429, historical state unavailable, Blockreq public ограничен1024блоками.
4. Прямой hook conversion требует operator. Но operator сам контракт:
   независимый вызов через его публичный интерфейс ещё НЕ исключён.
   `sweepPool(bytes32)` selector0x431d17b7 проверен eth_call по12пулам: одинаковый
   revert0x78013180(...1) для нашего адреса и keeper. Это не доказывает ни запрет
   доступа, ни permissionless исполнение. Другой selector0x21724275 даёт разные
   reverts для keeper/постороннего. Требуются ABI/source и проверка на eligible pool.
5. Накопленные TOKEN могут блокировать обычный sweep целиком, включая USDG на hook:
   проверка trusted operator стоит до распределения. Уже зачисленный escrow claim
   независим от этого. Rescue есть у owner Pons, не у нашего проекта.

## Что запросить у Pons (черновик, не отправлен)

We are integrating a USDG-paired Pons V2 token with a contract fee recipient.
Before committing to the integration, could you provide:

1. The exact reproducible deployment source/build inputs for the live V2 graph,
   including FeeEscrow and feeSweepOperator at
   0xa1018c1D9655292A2dE0F7dEa9a0F848EaA8cA83?
   Current pons-labs main b51431f references exemptFromSnipeTax in the factory,
   but the published bonding curve does not implement it.
2. The operator ABI and access rules: can a creator or independent keeper execute
   sweepPool(bytes32), under which eligibility conditions, and is onboarding needed?
3. Are new USDG pools automatically covered? What thresholds/cadence apply, and
   how can creators recover or independently process fees if your keeper is offline?

## Evidence и воспроизведение

Локальные команды: `node .local/pons-compile.cjs`,
`node .local/pons-compile-factory.cjs`, `node .local/pons-recent.cjs`,
`node .local/pons-receipts.cjs`, `node .local/pons-public-probe.cjs`.
Диагностические scripts/evidence локальные, не продуктовые runner; compile factory
печатает Solidity errors, её process exit0 не является PASS.
Отчёты `.local/logs/pons-current-source.json`, `pons-compile-true-200.json`,
`pons-recent-sweeps.json`, `pons-operator-receipts.json`,
`pons-operator-access.json`, `pons-permissionless-probes.json`.

Источники: [Pons docs](https://docs.ponsfamily.com/v2),
[исходники](https://github.com/ponsdotdev/pons-labs/tree/b51431f7d5242fc5414a7da7d3659ad3bc749eb7/contractsV2).
Результат: hook implementation и реальная USDG conversion подтверждены;
полная source verification и независимый fallback пока открыты. Перенос не продолжать
до разбора этих границ или нового явного решения владельца.
