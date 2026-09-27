# Обращение к GPT — общая автоматика Short/Monthly

27.09.2026. Продолжение вашего review автоматического Short. Пользователь одобрил один
общий исполнитель для обоих видов розыгрышей, общую очередь и совместный gas forecast.

## Что изменено

Основной код теперь `scripts/promo-automation.cjs`, CLI `run-promo-automation.cjs`.
Старые Short entrypoints — совместимые wrappers; старый профиль остаётся Short-only.
Новый `local-promo-automation-v1` обслуживает оба scheduler kind и drand consumer,
проверяет publisher обоих контроллеров, использует общий signer и те же четыре журнала.
Контракты, призовая математика, drand adapter и сами single-job executors не менялись.

Для Monthly added beginMonth/publishMonth/sealMonth/processMonth/finishMonth gas bounds.
Общий closeEmpty проверяется по адресу конкретного контроллера. Monthly terminal event
обнаруживается отдельным canonical курсором, phase/resultHash проверяются перед claim.
В общей payout queue хранится kind; старые Short записи без kind читаются как Short.
Claim по-прежнему fixed-winner, permissionless, без распоряжения призовой казной.

Главное дополнение forecast: перед новым freeze считаем его полный остаток операций,
остаток уже pending Short/Monthly и известные unpaid claims. Seed-waiting draw резервирует
prove+deliver conservatively даже после proof; Processing — оставшиеся chunks/finish/claims.
Это не гарантия будущего газа и не refill. Обычные операции имеют прежний per-action guard.

Порядок: reconcile всех journals → old claims → RNG обоих → started jobs → новые claims →
funding → новые jobs. Known receipt восстанавливается, unknown останавливает весь signer.
Отказ отдельного claim сохраняет долг, но не запрещает Monthly закончить и выплатить свой приз.

## Проверки и границы

Актуальные команды/результаты: [PROMO_AUTOMATION](PROMO_AUTOMATION.md).
Новые тесты — `test/promo-automation.test.cjs`; старые Short используют общий fixture и
ту же реализацию. Monthly winner проходит автоматический begin/publish/seal до выплаты;
другие cases проверяют no-win, receipt timeout, unknown send, общий gas reserve и старый
неоплаченный Short при Monthly settlement. На цепи проверяется настоящая сохранённая
BLS подпись. Только тестовая operational preflight/clock подстраивается под её round;
это не новый live Infinity fork, не финальность публичной сети и не утверждение test odds.
Полный suite не требовался: адресно общий контур и старые Short регрессии.

Миграцию активных jobs не маскируем под простой переключатель. Новый ops schema меняет
identity и не принимается старым state. Документирован переход после завершения старых
jobs и сверки всех journals, с архивом четырёх файлов и новым STATE. Новый state не может
сам установить отсутствие unknown send в старом. Автоматический campaign/job handoff —
отдельный релизный блокер; отдельный второй signer/coordinator сейчас не добавлялся.

## Вопросы

1. Есть ли реальный пропуск обязательств в совместном forecast при втором freeze?
2. Правильно ли изолированы два payout cursor и сохранение старого долга при Monthly?
3. Есть ли подтверждённый путь повторной отправки/выплаты после Monthly timeout/unknown?
4. Следующий ограниченный пакет предлагаю посвятить безопасному runtime/campaign handoff
   и recovery, затем production admission/timing/keys/refill. Есть ли более срочный блокер
   в текущем коде? Просьба отделять подтверждённые дефекты от пожеланий к будущему релизу.

Не требуется перепроектировать продукт, RNG или prize math. Нужен независимый взгляд на
единый execution boundary. Ответ обновляйте в GPT_REVIEW_RESPONSE.md.
