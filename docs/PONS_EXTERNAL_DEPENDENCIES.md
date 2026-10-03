# Pons: внешние зависимости перед deployment

03.10.2026. Read-only проверка, публичных отправок0. Это частичная квалификация,
не разрешение запуска. [Машиночитаемый снимок](evidence/PONS_DEPENDENCIES_2026-10-03.json).

## Подтверждено на block79276225

Factory/hook/escrow/USDG runtime hashes совпали с предыдущим snapshot79272432.
Адрес feeSweepOperator по-прежнему0xa1018c1D9655292A2dE0F7dEa9a0F848EaA8cA83.
Owner factory/hook0x263ed295dAFaE1d9AAdD6E56c4B6F9f38eE019Dd.
Operator owner0x370cB84FffF9B3E517ECAFE3E05689B7168e97ac,
pendingOwner0x263ed295dAFaE1d9AAdD6E56c4B6F9f38eE019Dd.
Это внешние роли Pons, не адреса, которые надо подставить в наши governance roles.
Смена роли оператора не означает автоматическую остановку работы или перевод средств.

EIP1967 implementation/admin/beacon slots у factory/hook/escrow/operator нулевые.
**Это не доказательство отсутствия нестандартного proxy или возможности изменения
поведения через внешние ссылки.** Ошибка optional getter сохраняется null, а не
трактуется как отсутствие владельца. Проверка canonical hash повторена.

## Конкретный пробел текущего допуска: USDG implementation

USDG EIP1967 implementation:
`0x68184C449E1a8f34fA18d289737129FD27B66f8F`, runtime18644bytes,
hash `0x3a551ac5c744af57e68a1d1431ac403c0f516ffd7d224a75746aee11fc4f3baf`.
Owner getter USDG:0xcFA0388f5ddf905FdC08c45c716C15Dc10A14C6F.
Admin slot0 не доказывает невозможность upgrade: authority по реализации отдельно
не квалифицирована.

pons-public-profile.cjs проверяет runtime quote и decimals, но не implementation
slot/code. Смена реализации с прежним proxy runtime и decimals может пройти эти
проверки. Пока public execution не включён, ущерба этим пакетом не установлено.
Следующий обязательный patch: явный независимый implementation pin в public profile,
сверка slot+runtime на том же blockTag, отказ при drift/read failure и тест, где
proxy hash не изменился. Не превращать обнаруженное значение автоматически в
утверждённое; не блокировать drain по drift чужого owner/будущих fee recipients.
Границу drain при изменении самого USDG implementation определить явно: старый
pin нельзя автоматически заменять лишь ради возобновления выплат.

## Исходники Pons

Свежий origin/main `44a3db9193c365f6c25cf0d4c2efc396e6de0df5` получен через git fetch.
`git diff --exit-code b51431f7d5242fc5414a7da7d3659ad3bc749eb7 origin/main -- contractsV2`
вернул0: contract tree не изменилось. Исторический checkout не переписывался.
Factory по-прежнему вызывает exemptFromSnipeTax, отсутствующий в опубликованном
curve; реализации FeeEscrow/operator в tree не найдены. Полное source match
factory/escrow/operator остаётся открытым. Старую проверку hook с исключёнными
immutable/metadata нельзя выдавать за новую полную верификацию всего графа.

[Официальные docs](https://docs.ponsfamily.com/v2) описывают конвертацию накопленных
TOKEN в quote до выплаты и перенос несостоявшейся конвертации на потом.
[Опубликованные исходники](https://github.com/ponsdotdev/pons-labs/tree/44a3db9193c365f6c25cf0d4c2efc396e6de0df5/contractsV2)
показывают owner setters hook/factory. Описание docs само по себе не доказывает
тождество конкретному deployed runtime. Политика проекта остаётся прежней:
учитывать фактически полученный USDG; pending TOKEN не является призовым фондом.

## Повторение и проверки

RH_RPC_URL задать безопасно из локального секрета, затем:

```text
node scripts/inspect-pons-dependencies.cjs docs/evidence/PONS_DEPLOYMENT_GRAPH_2026-10-03.json NEW_OUTPUT.json
```

Только чтение; неверная chain/отсутствующий runtime/неполный обязательный RPC/
изменившийся block hash дают ошибку. Файл не перезаписывается, сырой RPC URL не
печатается. Standard proxy slots проверяются; это inventory, не admission.

`node --test test/pons-public-profile.test.cjs`:7/7 PASS, включая новый сценарий
неизменного proxy runtime с отдельной implementation, wrong chain и reorg.
Лог .local/logs/pons-dependency-inspection-tests.log. Исполнитель и контракты не
изменены; полный baseline и новый fork cycle не запускались.

Далее: закрыть implementation pin, затем exact deployment parameters/fork.
Source gaps остаются явно открытыми; при недоступных источниках не заявлять full
verification и не заменять её увеличением количества тестов.
