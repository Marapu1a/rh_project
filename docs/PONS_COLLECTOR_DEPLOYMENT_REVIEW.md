# Collector и порядок deployment: проверка03.10.2026

Статус: частичная квалификация, не подписываемый пакет. Контракты не изменены,
публичных отправок0. Основной вход: [подготовка](PONS_DEPLOYMENT_PREPARATION.md).

## Результат проверки collector

Просмотрены constructor, bindPromo/bindVenue, venue/source guards, pull/sync/pay,
rollCampaign и накопительное округление в LocalPonsCollector.sol.

- Constructor допускает ещё не созданный TOKEN: это необходимо для prediction;
  bindPromo требует уже существующий TOKEN и совпадающий TOKEN/USDG vault.
- Vault и venue привязываются один раз. Escrow immutable, его runtime закреплён.
- Сбой sweep не закрывает pull/pay; drift escrow закрывает pull, но не выплаты
  уже начисленных credits. ReentrancyGuard и SafeERC20 сохраняют атомарность.
- Credit относится к адресу. Одинаковые ops/team корректно суммируют обе доли;
  второй pay тому же адресу ничего не переводит. Новый EVM test это подтверждает.
- EndsAt ограничивает ранний rollover, а не останавливает сбор по истечении срока.
  Routine rollover остаётся owner-действием, не транзакцией публичного исполнителя.
- Donations непосредственно collector тоже распределяются90/5/5. Для пожертвования
  целиком призам нужен путь vault; это разные назначения переводов.
- Runtime hash proxy сам по себе не фиксирует implementation. Доверие к USDG,
  escrow, Pons conversion/operator и возможности внешнего обновления остаётся
  отдельной границей. Проверка getter не является доказательством исходников.

Пометка prototype остаётся: полного source/deployed/proxy qualification пока нет.
Нового подтверждённого денежного дефекта в просмотренном collector не найдено.

## Разделение publisher

BuyPolicySource.publisher — личный0x098a…2114 (изменение правил допуска).
Short/Monthly.publisher — executor0x7170…1Bf3 (публикация списков draw).
Governor и обе доли5% — личный кошелёк. Public inspector уже проверяет
controller.publisher==executor; ошибочно назначив туда личный адрес, получили бы
закрытый допуск и неработающую автоматизацию. Поэтому не использовать одно
неоднозначное поле publisherExecutor для обоих назначений.

## Точный порядок зависимостей

Ниже условный nonce N личного deployer, **не зарезервированный nonce сети**.
Любая дополнительная транзакция, включая approve или отмену, меняет CREATE prediction.

| Nonce | Действие | Что закрепляется |
|---|---|---|
| N | CREATE LocalPonsCollector | owner=личный, predicted TOKEN, USDG, свежий escrow |
| N+1 | Pons factory.launchToken | creatorFeeRecipient=collector, tax300bps, buyback=false; metadata/economics/salt ещё нужны |
| N+2 | CREATE ParticipantRegistry | Реальный адрес для обоих controllers |
| N+3 | CREATE DrandRandomAdapter | Short=CREATE(N+4), Monthly=CREATE(N+5), production timing |
| N+4 | CREATE RobinhoodShortController | Vault=CREATE(N+6), registry, adapter, governor, executor publisher, genesis |
| N+5 | CREATE RobinhoodMonthlyController | Тот же vault/registry/adapter, отдельный instance, monthly genesis |
| N+6 | CREATE DualControllerPromoVault | TOKEN/USDG, Short/Monthly; reverse bindings; target100USDG |
| N+7 | CREATE BuyPolicySource | instance/genesis/initialAdapters, личный publisher, noticeBlocks |
| N+8 | collector.bindPromo | Vault/личный/личный;9000/500/500, endsAt |
| N+9 | collector.bindVenue | Проверенный Pons factory |

TOKEN prediction — результат точного вызова Pons, не CREATE(deployer,N+1).
CREATE адреса выводятся от личного EOA; factory launch потребляет его nonce,
но создаёт TOKEN своим механизмом. Не копировать этот порядок как готовую команду:
сначала dry fork с немодифицированными constructor clocks, точными params и
отдельными governor/executor. Каждая фактическая tx и runtime должны совпасть.
Нельзя автоматически продолжать при nonce drift; пересчитать весь зависимый граф.

До launch: определить genesis/правила начального блока учёта и обеспечить replay
ранних покупок. После receipts: canonical anchor, runtime/immutable pins, configHash,
inspector, indexer/API, только затем новые задачи operator и собственный BUY101.
Ожидание6ч/30д от обычных конструкторов — реальное поведение, не повод backdate.

## Свежие факты и ограничения

[RPC snapshot](evidence/PONS_DEPLOYMENT_GRAPH_2026-10-03.json): block79272432,
chain4663, canLaunch=true, USDG approved=true; launch fee0.0005ETH.
Finalized lag855s — **один замер**, не SLA/подтверждение timingCandidate1200s.
Factory/hook/escrow/USDG hashes записаны, canonical hash блока повторно совпал.
Это read-only наблюдение; полная проверка proxy implementation и router pins
в этот узкий снимок не входит. Перед подписью нужен свежий снимок.

## Проверки и следующий пакет

`node --test test/pons-collector.test.cjs`:10/10 PASS,17.1s,03.10.2026;
неизменённый проверенный compiled artifact через RH_TEST_ARTIFACT/SHA256.
Лог: .local/logs/collector-qualification-tests.log. Секрет RPC прочитан из локального
файла без печати URL. Это адресные EVM tests с fixtures, не повтор всей репетиции.

Осталось до подписываемого плана: source/proxy qualification, metadata URI/hash,
production timing/notice/gas/campaign end, exact params/salt/nonce и initcode,
симуляция графа с раздельными ролями, независимые runtime pins. Не выдавать таблицу
зависимостей за готовые calldata или завершённую квалификацию deployment.
