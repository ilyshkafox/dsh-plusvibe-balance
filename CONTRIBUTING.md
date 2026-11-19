# Contributing

English | [Русский](#по-русски)

## English

Thanks for looking. This is a small plugin; the useful contributions are bug
reports with detail, and fixes that stay small.

Questions and anything that does not fit an issue: <ilyshkafox@mail.ru>.

### Before you open a pull request

1. Run the checks:
   ```sh
   node --check index.js
   node --check client.js
   npm pack --dry-run
   ```
2. Load the plugin in a profile and look at the result in the browser — a green
   syntax check says nothing about a slot rendering.
3. Keep the change scoped: one fix or one feature per pull request.

### What fits

- A wrong number, a rounding bug, a broken endpoint — please include the raw
  API response (with the key removed), your DSH version, and the model.
- Another provider host that should be auto-detected.
- A locale addition: copy `locale/en.json`, translate the `meta` fields, and add
  the UI dictionary to `client.js`.

### What does not fit

- Storing or transmitting the API key anywhere but the Host half.
- Calling PlusVibeAPI from the page.
- A new dependency for something the standard library already does — the package
  has no runtime dependencies and should keep it that way.
- Anything that makes the plugin look official. It is not; see the Trademarks
  section of the README.

### Style

Plain ES modules, no build step. Comments explain *why*, not *what*. Keep the
Host half free of DOM and the browser half free of secrets.

## По-русски

Спасибо, что заглянули. Плагин маленький, поэтому полезнее всего: подробные
сообщения об ошибках и небольшие правки.

Вопросы и всё, что не помещается в issue: <ilyshkafox@mail.ru>.

### Перед pull request

1. Прогоните проверки:
   ```sh
   node --check index.js
   node --check client.js
   npm pack --dry-run
   ```
2. Загрузите плагин в профиль и посмотрите результат в браузере — успешная
   проверка синтаксиса ничего не говорит о том, что слот отрисовался.
3. Держите правку узкой: одна ошибка или одна возможность на pull request.

### Что подходит

- Неверная цифра, ошибка округления, сломанный эндпоинт — приложите сырой ответ
  API (без ключа), версию DSH и модель.
- Ещё один хост провайдера, который стоит определять автоматически.
- Новый язык: скопируйте `locale/en.json`, переведите поля `meta` и добавьте
  словарь интерфейса в `client.js`.

### Что не подходит

- Хранить или передавать ключ API где-либо, кроме Host-половины.
- Звать PlusVibeAPI со страницы.
- Новая зависимость для того, что уже умеет стандартная библиотека — у пакета
  нет runtime-зависимостей, и так должно остаться.
- Всё, что делает плагин похожим на официальный. Он не официальный; см. раздел
  «Товарные знаки» в README.

### Стиль

Обычные ES-модули, без шага сборки. Комментарии объясняют *почему*, а не *что*.
В Host-половине не должно быть DOM, в браузерной — секретов.
