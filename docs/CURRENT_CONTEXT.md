# Текущий контекст

Обновлено 20.09.2026. Читать первым; подробная история не нужна для обычного продолжения.

## Где находимся

Собираем локальный MVP: спекулятивный TOKEN + отдельное добровольное промо,
6-часовой Short и месячный jackpot, денежные призы только USDG. Публичного deployment нет.
Приоритет пользователя: сначала достроить целый скелет, затем доводить по участкам.
Допускается переработка частей; локальные допущения не выдавать за production готовность.

Работает локальная цепочка:
`BUY → scan/replay → scheduler/builders → сохранённые jobs → Short/Monthly workers → prize/claim → следующий цикл`.
Отдельно соединено `source collect/harvest USDG → FeeRouter credits/pay → призовые резервы + recipients проекта`.
Это не PAIR fork. BUY-стенд упрощённый, RNG управляемый тестовый; контроллеры только chainId 31337.

## Последний результат

- Добавлен [локальный coordinator](LOCAL_PROMO_COORDINATOR.md): последовательный
  prize-flow → Short/Monthly scheduler, общий signer без параллельных writes,
  сохраняемый pending intent до broadcast и hash после ответа RPC. Unknown останавливает
  оба контура и restart; известный hash проверяется по receipt перед продолжением.
  Hashless crash/outage требует диагностики, force-clear нет. Solidity не менялся.
  `npm test`: 244/247 (~1142 s); все прежние **240/240** прошли. Три новых restart
  сценария обнаружили undefined metadata/checksum mismatch; сериализация исправлена.
  После фикса отдельный `test/local-coordinator.test.cjs`: **7/7**, fail 0 (~144 s).
  Полный набор после этой локальной правки повторно не запускали.

- Исправлен stale action/hash в prize-flow: lastConfirmed отделён от ошибки текущего intent.
  Scheduler теперь глобально останавливается на unknown tx/RPC, сохраняя stage/hash;
  Short/Monthly/closeEmpty используют явный estimate/broadcast/confirm. Общего coordinator нет.
  Bound default prize-flow закреплён формулой 123 <= 128 и maximal-legacy интеграцией.
  **42/42** проверок прошли; основной набор **240**, полностью не запускался.

- [Prize flow](LOCAL_PRIZE_FLOW.md): **11/11** новых проверок с реальным локальным CLI,
  **35/35** соседних регрессий. Основной набор **232**, целиком не запускался.
  Доход обоих активов автоматически проходит новый custody path; old recipient debt
  обслуживается по bounded списку. Real DEX и live PAIR не подключены.

- Добавлен LocalPrizeConverter и fixed swap fixture; модель/ограничения —
  [LOCAL_PRIZE_CONVERTER](LOCAL_PRIZE_CONVERTER.md). Converter **5/5**, tx/CLI **11/11**, BUY-cycle **1/1** из cwd без `.local`;
  runtime 4 556 bytes.
  Основной список **221**, целиком не запускался.
- После GPT review исправлены создание `.local` в BUY-тесте и структурированный
  CLI error с code/stage/transactionHash. Неизвестная tx по-прежнему останавливает writes.

- Recipient isolation: **37/37** FeeRouter/funding/BUY, **10/10** классификация tx,
  **5/5** соседние worker-регрессии. Основной набор **215**, целиком не запускался.
  C закрыт в локальном worker; TOKEN custody A остаётся открытым. Подробности —
  [LOCAL_USDG_REVENUE](LOCAL_USDG_REVENUE.md).

- [Review последних связок](AUTOMATION_REVIEW_2026-09-20.md): исправлен автоматический
  повтор begin после reorg с сохранившимся cutoff. На момент review были открыты два дефекта: permissionless
  TOKEN pay в USDG-only vault и блокировка нового collect неисправным project recipient.
  Второй затем исправлен; см. следующий шаг ниже.
  TOKEN-маршрут текущего deployment-профиля не готов для реальных средств.
  Затронутый набор **21/21** (~304 s); два теста подтверждают ещё открытые дефекты.
  Основной список теперь **201**, полного запуска 201 не было.

- Revenue-интеграция 20.09: **31/31** (~222 s): FeeRouter, funding/revenue и полный BUY-cycle.
  Добавлены семь отказных/интеграционных проверок. На этом шаге список содержал **198**;
  весь набор 198 не запускали. Solidity и денежная математика не менялись.

- [Локальный планировщик](LOCAL_PROMO_SCHEDULER.md): общий CLI, сохранение job до tx,
  restart из state, независимые Short/Monthly, schedule/empty/funding/seed waits,
  закрытие пустой draining epoch по replay и обновление лишь неначатого истёкшего cutoff.
  Два Short + два Monthly теперь проверены без ручного изготовления jobs; terminal reorg
  возвращает прежний job в работу. Аварийный stale lock/потеря state требуют recovery.
- [USDG funding](LOCAL_USDG_FUNDING.md): полученный доход распределяется существующими
  контрактами. [Revenue pass](LOCAL_USDG_REVENUE.md) теперь автоматизирует collect/harvest,
  сперва платит старые credits, изолирует известный отказ source и останавливается при
  неоднозначной отправке. Проценты и GENERAL для creator revenue —
  явно тестовая конфигурация, не утверждённая production экономика.
- [BUY cycle](LOCAL_BUY_CYCLE.md): carry, регистрация без backdating, новые BUY после cutoff,
  независимый расход Short/Monthly, win/no-win, старые claims и conservation USDG.
- Проверка 20.09: **11/11** (~259 s): пять scheduler-тестов, пять регрессий workers
  и прежний сквозной BUY-cycle. В основной список добавлены пять scheduler-тестов.
- Предыдущий затронутый набор funding: 24/24 (~185 s), 20.09. Полный baseline 19.09:
  176/176 до исправлений workers; затем отдельные 6/6 на receipt/cutoff и BUY-cycle.
  На шаге scheduler список содержал 191 тест; полного запуска 191 не было.
- Локальные runtime: Short 22 237, Monthly 17 453, vault 8 496 bytes; real RNG не включён.
  В шаге scheduler Solidity не менялся.

## Следующий ограниченный шаг

[Локальный prize-flow worker](LOCAL_PRIZE_FLOW.md) связал FeeRouter, converter и USDG vault:
collect/harvest обоих активов, pay/forward до swap, bounded legacy recipients,
изоляция definite отказов и stop на unknown tx. Отдельный local-prize-flow-v1 job/CLI.
Старые USDG jobs не изменены; unsafe legacy TOKEN→USDG-only credit только диагностируется.

Совместное локальное исполнение реализовано в coordinator, с минимальным pending marker.
Следующий разумный кусок — отдельный project gas budget: readiness, native buffer и
лимиты расхода из доли проекта. Не использовать frozen/claimable и не объявлять
coordinator полноценным journal/autorefill/production supervisor. Real DEX/price guard и RNG
остаются отдельными архитектурными решениями; fixed floor только для chainId 31337.

После этого остаются эксплуатационное финансирование и настоящий RNG с безопасной привязкой.
Draw scheduler и revenue worker пока запускаются отдельно; общего supervisor нет.

## Незакрытые границы

- Полнота snapshot доверена publisher; replay обнаруживает подлог, не блокирует его on-chain.
- Scheduler LOCAL_HEAD — допущение стенда, не finality. Fixed lead drand не решает stale
  clock/reorg-after-reveal; production future-round binding/adapter ещё не выбран.
- Есть локальные scheduler/workers, но нет incremental indexer, supervisor, durable mempool
  journal, autorefill и production контроллеров. Полная история перечитывается из RPC.
- Creator shares, формула D, K/weights, admission и execution budgets не утверждены для deployment.
- Локальная readiness не гарантирует газ на всё завершение; bootstrap тестовый.

## Опорные правила

Призы невозвратны проекту; free, reserved и claimable раздельны. Старые долги сохраняются.
После freeze нет reroll, замены random или административного reset. No-winner допустим,
недоставленный random не равен проигрышу. Luck удалён. Sponsor layer позже и отдельно.
FeeRouter recipient slots не являются Short/Current/Next accounting.

Правила — [PRODUCT_SPEC](PRODUCT_SPEC.md); код — [IMPLEMENTATION_STATUS](IMPLEMENTATION_STATUS.md).
Архив открывать только с конкретным вопросом. Перед продолжением проверить git status:
локальные изменения предыдущих шагов могут ещё не быть закоммичены.

## Последние продуктовые уточнения

Все денежные призы остаются USDG; TOKEN ждёт обмена до попадания в USDG-резервы.
Общий конвертер не запрещён: отдельный адрес на каждую campaign пока не принят.
Учёт начислений по campaign не равен обещанию отдельного USDG результата её продажи.
[Актуальная PAIR policy](PAIR_CURRENT_FEE_POLICY.md): V1 70/30 не переносится на Launch V2.
[Обращение к GPT](GPT_REVIEW_REQUEST.md) передаёт текущий контекст и границы шага;
ответ GPT — вспомогательный материал, не автоматическое задание.
