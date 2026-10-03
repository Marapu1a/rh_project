# Проверка признаков риска токена перед запуском

03.10.2026. Запрос владельца: отсутствие пугающих свойств токена, а не повышение
числового GT Score. **Типичные token-level backdoors в проверенном варианте не
обнаружены.** Публичный TOKEN пока отсутствует; это проверка будущего кода на fork,
а не результат сканирования QIANQI сервисом GoPlus и не аудит всего Pons.

[Evidence](evidence/PONS_TOKEN_SECURITY_2026-10-03.json).

## Что проверено

| Признак | Результат |
|---|---|
| Дополнительная эмиссия | Только constructor mint1млрд; публичной mint нет. Supply может уменьшаться добровольным burn |
| Owner / hidden owner / изменение чужого баланса | В token logic нет административных функций; deployer — immutable справочная ссылка |
| Blacklist / pause / whitelist / max wallet | В token logic отсутствуют; это отдельно от launch snipe exemptions площадки |
| Proxy / external calls при переводе | В проверенном исполняемом коде токена отсутствуют |
| Anti Whale | Ограничений размера кошелька/перевода нет; NO не является отрицательным признаком |
| Transfer tax | Два полных перевода между обычными адресами: удержание0 |
| Покупка → полная продажа | После opening window покупки1 и101USDG; весь объём передан другому адресу и продан им обратно |
| Комиссия curve | feeBps100 + creatorTaxBps300: базовая1% + creator3%; не обещать общую комиссию3% |
| Opening protection | live factory snipeTaxSeconds3; raw getter сразу9900bps для обычного адреса,0 для governor; через10s0 |

Raw snipe getter не равен суммарному фактическому удержанию: по документации Pons
расчёт ограничивает snipe с учётом остальных комиссий, оставляя минимум1% на BUY.
Дополнительная snipe-комиссия касается покупки, не продажи. Launcher/creator recipient
автоматически exempt. Наша отдельная покупка после настройки этим преимуществом
первых секунд не пользуется. Точный эффективный opening BUY этим прогоном не измерен.

## Доказательство исходников

Получен verified-source bundle Harmonic Agent из
[Sourcify](https://sourcify.dev/server/v2/contract/4663/0xdEe52F2ab639b6942B0d0F0565400b93b7a0fbe5?fields=all).
Компилятор0.8.35, viaIR, optimizer200, Cancun. Перекомпилированы token и все его
OpenZeppelin зависимости; три immutable адреса заполнены значениями нашего fork.
**Весь исполняемый runtime совпал**, включая реализацию transfer/burn/allowances.
Отличаются32байта IPFS hash в CBOR metadata. Полный byte-for-byte match и будущая
публичная source verification QIANQI пока не заявляются.

Это существенно сильнее сравнения с Index: Index отсутствует в текущей V2 factory
и имеет другой runtime. Harmonic использует тот же проверенный тип token logic.
Его [ответ GoPlus](https://api.gopluslabs.io/api/v1/token_security/4663?contract_addresses=0xdee52f2ab639b6942b0d0f0565400b93b7a0fbe5)
сейчас сообщает open-source1, honeypot/mint/blacklist/pause/owner-change-balance/proxy0.
Это полезный пример распознавания, **не перенесённый вердикт для QIANQI**.
GoPlus показывает у него buy/sell tax0; это не основание объявлять нулевыми наши
внешние комиссии curve/hook.

## Прогон и ограничения

`scripts/pons-token-security-rehearsal.cjs PLAN NEW_REPORT` — PASSED на fork79372562:
тот же factory.launchToken и исходный salt, runtime hash
`0x68375920a0acc51f0038b37aeaf86dbb35b44cefd95d1b62ea770baa6b41d8be`.
Обычные тестовые адреса не входят в creator exemptions; синтетические ETH/USDG.
После BUY1USDG и полного SELL получено0.921601USDG; после BUY101 —93.081601USDG.
Потери включают комиссии и механику цены; это не измерение отдельного tax из GoPlus.
Стандартные попытки owner/mint/blacklist/pause/setTax/maxWallet reverted, но сами
по себе такие probes не доказывают отсутствие всех неизвестных методов — вывод
опирается также на воспроизводимое совпадение исполняемого кода.

`scripts/verify-pons-token-source.cjs SOURCE COMPILER PROBE RUNTIME NEW_REPORT` —
EXECUTABLE_RUNTIME_MATCH. Локальные данные: `.local/logs/pons-token-security.json`,
его `.runtime.txt`, `pons-security-source-sourcify.json`, `pons-token-source-match.json`;
compiler `.local/soljson-0.8.35.cjs`. Initial full-bytecode assertion выявил только
metadata mismatch, который явно сохранён в итоговом отчёте.

Graduated pool, права factory/hook/operator и все ранее принятые source gaps этим
узким прогоном не переквалифицируются. Документация Pons описывает creator tax как
фиксированный при создании; абсолютной неизменности всей внешней системы не заявляем.
Торговые ошибки при slippage/ликвидности/RPC остаются возможны даже у обычного ERC20.

## Что осталось перед публичным использованием

1. После launch проверить verification именно QIANQI в explorer/Sourcify и запросить
   его собственный GoPlus report. При unknown/closed-source разобраться с публикацией,
   не считать пропущенные поля зелёными.
2. До активации публичного фронта уточнить текст комиссий: creator3% отдельно от
   базовой комиссии Pons; указать opening snipe window. Денежные правила не менять.
3. Если сканер выдаст предупреждение, сопоставлять его с реальным кодом и маршрутом;
   не менять права/ликвидность только ради цвета значка.

Источники: [описание полей GoPlus](https://docs.gopluslabs.io/reference/response-details),
[Pons V2, fees/snipe](https://docs.ponsfamily.com/v2),
[исходник токена](https://github.com/ponsdotdev/pons-labs/blob/main/contractsV2/src/v2/PonsV2LauncherToken.sol).
