# Кошелёк автоматики: custody

03.10.2026. Создан по решению пользователя, без публичных транзакций.

- Executor: `0x7170c2d8Abd99C471B89ffcAaC765d5aD94D1Bf3`.
- Governor / BUY policy publisher / operations5% / team5%: согласованный личный
  `0x098afA6731239a00CE0aff669aaefD16b7C72114`.
- Executor не назначен владельцем или publisher; deployments пока отсутствуют.
- Ключ сгенерирован CSPRNG на сервере, без mnemonic; encrypted JSON keystore.
- Сервер: `/etc/qianqi/executor-custody`, root0700; executor.json/password.txt/public.json root0600.
  Пароль пока root-only файл; подключение через systemd credentials — следующий
  сервисный пакет. Пароль и keystore на одном сервере не защищают от root compromise.
- Копия вне сервера: `C:\Users\Valentine\.qianqi-recovery\executor.json` и public.json.
- Пароль: `C:\Users\Valentine\.qianqi-credentials\executor-password.txt`.
  Оба Windows каталога без наследуемых ACL, доступны текущему пользователю и SYSTEM.
  Разные папки не являются защитой от компрометации той же Windows-учётной записи.
- Пользователю предстоит перенести пароль в менеджер паролей и сохранить keystore
  на независимый носитель. Пользователь подтвердил сохранение копий03.10.2026; способ личного хранения не проверялся.

## Проверка

Server decrypt/address PASS; скачанный keystore SHA256 совпал; независимое локальное
расшифрование и offline sign/verify PASS. Подпись не публиковалась. RPC не использовался,
транзакций0, сервисы не включались. Keystore SHA256:
`95febd49001a933ce51d803432926e7e6abfc7a3a4bdd1a72225ebb7e1442cf0`.
Первые попытки не перезаписывались: пустой каталог после ошибки типа Buffer/Wallet
проверен перед повтором; успешный запуск использовал hexlify(randomBytes(32)).

Секреты вне репозитория. Не печатать их при диагностике, не добавлять к общим логам
или в git. Адрес ещё не является утверждённым executable deployment config.

Следующий шаг: квалификация collector и конкретный deployment transaction plan;
подключение signer к службе и финансовый запуск отдельно.
