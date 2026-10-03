# Пакет 3A: копии вне VPS и подготовка подписания

03.10.2026. Публичных отправок0. Контракты не менялись, сайт/API/financial units
не переключались. Это подготовка первых шести CREATE, не завершённый mainnet launch.

## Резервные копии

Владелец выбрал текущий Windows-компьютер. Task Scheduler:
`QIANQI-Offserver-Backup`, раз в час, текущий пользователь, Interactive/Limited,
StartWhenAvailable, параллельный запуск запрещён, timeout30мин.
**Нужны включённый компьютер, вход пользователя в Windows и сеть.** При выключении
VPS и компьютера одновременно новой независимой копии не будет; последняя скачанная
сохраняется. Это согласованный начальный вариант, не постоянно доступное облачное хранилище.

`ops/pull-backups.ps1` скачивает все недостающие завершённые архивы в
`C:\Users\Valentine\.qianqi-backups`; ACL user/SYSTEM. Использует существующий SSH key
с BatchMode/StrictHostKeyChecking, без пароля в task. Новые архивы сначала `.partial`,
проверка SHA256, затем финальное имя. Готовые копии сверяются, не дублируются.
Повреждённые локальные копии не перезаписываются/не удаляются. `last-pull.json` —
время и результат, в том числе `awaitingFirstBackup` до первых production snapshots.
Автоматического retention/deletion нет; контролировать место на обоих узлах.
Папка Windows находится вне репозитория, сама задача зависит от пути checkout к скрипту.

На VPS `/opt/qianqi/operations/backup-public.sh` root0644; backup unit теперь использует
его, старый immutable runtime release не переписан. После offline snapshot скрипт
создаёт tar.gz и отдельный SHA256, публикует их атомарными rename. Pull читает только
готовый checksum marker, поэтому не подхватывает недописанный архив. Секреты по-прежнему
отдельно, архивируются state/public configs/release manifest. Backup timer disabled
до financial activation; Windows pull уже enabled и успешно запускался планировщиком.

Проверки:
- тестовый fork snapshot скачан: downloaded1; повтор: downloaded0, hash совпал;
- испорченная локальная копия отвергнута и сохранена для разбора;
- отдельный Linux прогон нового backup script: настоящие snapshot/tar/SHA256,
  **systemctl заменён тестовой заглушкой**, директории отдельные; последовательность
  stop → snapshot → start indexer → start operator проверена без остановки live services;
- Scheduled Task LastTaskResult0, обычный путь честно awaitingFirstBackup.
  Отказ выгрузки виден в локальном status/task result; Telegram с VPS не контролирует
  доступность компьютера или факт скачивания. Восстановление Linux/Windows уже проверено пакетом2.

## Свежая проверка Pons и повтор deployment

`scripts/pons-launch-preflight.cjs NEW_REPORT` с RH_RPC_URL: chain4663,
runtime dependencies, USDG implementation, factory bindings/economics/canLaunch,
quote decimals/approval, обе nonce, балансы, canonical snapshot и finalized lag.
Это read-only snapshot, не разрешение подписания и не новый source audit.

Снимок block79313722: изменений0, pending transactions0, governor nonce14,
finalized lag804s (<1200). Governor109.622644USDG, примерно0.0031453ETH;
executor0ETH — пополнить по оценке ближайших операций перед включением worker.
Не вводится фиксированный запас0.6ETH. Суммы и nonce устаревают; live проверки повторяются.

Новая полная репетиция `pons-exact-deployment-rehearsal.cjs` на fork79314557:
10deployment tx PASS, обычные constructors, early101USDG → Short1/Monthly1,
admission/funding PASS. Газ22131415; base fee снимка + launch fee дают ориентир
0.00101375866781ETH, **не гарантированный полный счёт** (изменение fees/L1 data/
дополнительные действия отдельно). Текущего governor balance по этому ориентиру
хватает, но проверяется бюджет каждой подписи. Instance/ArbSys/finality/synthetic balances
сохраняют те же явные fork-допущения, что пакет1.

## Локальная очередь MetaMask

`deployment-signing-plan.cjs REPORT ARTIFACT IMMUTABLE_LAYOUT NEW_OUTPUT` заново
кодирует constructor args из утверждённых settings/product rules, сверяет initcode
с прошедшей репетицией и artifactHash. Экспортирует только:
registry → collector → adapter → Short → Monthly → vault, nonce14…19.
Ожидаемые CREATE адреса привязаны к governor/nonce. До подписания не совершать
посторонние транзакции управляющим кошельком — иначе пересобрать план.

Важная найденная ошибка нового handoff: Short/Monthly имеют immutable время создания,
поэтому буквальный runtimeHash из fork не совпадёт в другом блоке. Исправлено:
`deployment-immutable-layout.cjs` повторно компилирует **те же** исходники/settings,
проверяет точное равенство compiled deployed bytecode и извлекает solc AST/offsets
только `shortRulesStartedAt` и `monthlyStartedAt`. Receipt checker требует, чтобы
эти32байтные поля равнялись timestamp реального блока, затем нормализует только их
к времени репетиции и сверяет полный хеш остального кода. Остальные immutables
не игнорируются; constructors/роли/математика не менялись.

`deployment-signing-queue.cjs`: перед подготовкой и intent сверка nonce/latest+pending,
свободного CREATE address, RPC preflight, gas/баланса. Intent сохраняется **до** окна
кошелька. Полученный hash принимается только после сверки from/to/chain/nonce/data/value,
receipt/block/contract address/runtime. Ранее подтверждённые шаги также пересверяются.
Reorg/неизвестный hash/обрыв не очищают journal и не разрешают автоматическую повторную
отправку. Отмена кошельком после arm требует ручной сверки сохранённого intent: удобный
автоматический reset намеренно не реализован. Реконнект не должен удваивать CREATE.

`deployment-console.cjs PLAN JOURNAL` слушает только127.0.0.1:4176, Host/Origin+
случайный ключ сессии, no-store/CSP, выбор EIP-6963 provider. Ключ/ссылка в локальном
логе; RPC/keystore браузеру не передаются. Сервер не подписывает транзакции.
По умолчанию **review-only**, `/intent` запрещён. `--enable-signing` включается
отдельно для конкретного проверенного плана; каждая eth_sendTransaction требует
клика владельца. Перед каждым шагом дополнительно eth_call launchToken проверяет
те же predicted Token/Curve при текущих economics/fee, без отправки.

После шести CREATE очередь останавливается. Pons launch, BUY policy и collector
bindings готовятся следующей фазой по **реальным** receipts и anchor. Старый fork
policy calldata не экспортируется. Это не обещание готового одноразового broadcaster
всех10транзакций. Следующая фаза должна сохранить выбранные salt/token и nonce-граф.

## Проверки и артефакты

- 10 адресных node tests: preflight3, signing-plan2, signing-queue5. Отдельно catalog1.
  Команда `node --test test/pons-launch-preflight.test.cjs test/deployment-signing-plan.test.cjs test/deployment-signing-queue.test.cjs` (после изменений повторялись только затронутые).
- Полный deployment fork10tx выше; затем **сама новая очередь** создала6контрактов
  на fork79326672. После каждого intent и receipt новый экземпляр queue читал journal:
  6+6 восстановлений PASS, повторных отправок0, stop after prefix PASS.
  Имперсонация governor/synthetic ETH/ArbSys, preflight callback в этом harness mocked;
  live read-only preflight проверен отдельно. Это не настоящая подпись MetaMask.
- Browser smoke с synthetic EIP-1193 provider: connect → live RPC prepare PASS,
  неправильный HTTP доступ403, попытка arm в review-only409, кнопка подписания disabled.
  Реальный MetaMask должен быть подключён владельцем на следующем шаге.
- Первый queue-fork отказал на старом storage proof (missing trie node) — для
  Hardhat взят свежий anchor при неизменном governor nonce. Это ограничение старого
  eth_getProof у RPC; поддержку всех historical calls отсюда не выводим.
  Следующий прогон поймал time-immutable mismatch; финальный после исправления PASS.

Локальные evidence: `.local/logs/package3-preflight.json`, `package3-deployment-fresh.json`,
`package3-immutable-layout.json`, `package3-signing-prefix-final.json`,
`package3-queue-fork-final.log`, `package3-console-smoke.json`.
Fork signing journal отдельный от public review journal. Старые неудачные артефакты сохранены.
Полный test suite не повторялся; исходные контракты и их artifact bytecode не менялись.

Дальше: сверка владельцем конкретных первых CREATE → включение signing для этого
плана → реальные receipts → свежая подготовка оставшихся launch/policy/bind вызовов.
Финансовая автоматика/индексатор пока выключены; только monitor timer и Windows pull активны.

## Переход к ручным подписям

03.10 владелец показал успешный MetaMask review первого CREATE. Повторный live prepare
подтвердил nonce14, completed0/pending=null и готовность первого шага. Консоль
перезапущена с --enable-signing для package3-signing-prefix-final.json; journal тот же
package3-signing-journal-final.json. Старый read-only процесс точно идентифицирован
и остановлен, его lock архивирован после проверки отсутствия intent. GET/POST view
новой сессии подтвердил allowSend=true, completed0, pending=null. Отправки остаются
ручными через MetaMask; /intent инструментами не вызывался. Ссылка с новым ключом
сессии передаётся владельцу отдельно, в git не хранится.

## Исправление gas review при первом ручном шаге

До первого intent проверка сравнивала hash всего повторно оценённого запроса, включая
изменяющиеся gas/gasPrice, и возвращала общий409. На момент диагностики public journal
отсутствует, nonce latest/pending14, preflight matched. Теперь prepare показывает
фиксированную цену с20% headroom, ограниченную существующим maxGasPrice; arm сохраняет
именно просмотренный запрос, проверяет неизменные поля и достаточность gas limit,
цены и ETH. Рост сверх показанной границы требует нового review до intent.
Добавлены понятные сообщения для истечения review/газа/nonce/preflight и безопасные
reason codes в локальном логе без raw RPC errors.7 queue tests PASS, включая малый
fee/estimate drift и отказ до записи intent при выходе за границу. Live prepare после
перезапуска PASS; инструменты /intent не вызывали. Контракты и product rules не менялись.

## Исправление кнопок локальной консоли

Повторное connect после prepare оставляло sign disabled из-за общего action wrapper.
Теперь render вычисляет состояние кнопок после любого действия; reconnect/refresh
сохраняют ещё действующий review, ошибки/смена аккаунта/expiry отключают подпись.
Повторное подключение не добавляет дубли listeners. Review доступен после подключения,
подсказка указывает следующий клик.2 VM UI scenarios и catalog1 PASS; eth_sendTransaction
и /intent в проверках не вызывались. На момент диагностики public journal отсутствовал.
Статические файлы обновлены без перезапуска сервера, ссылка сессии сохранена.
