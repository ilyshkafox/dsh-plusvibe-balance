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

## Releasing (maintainers)

The package has no build step, so a release is a version bump and a GitHub
Release. Publishing to npm happens by itself.

1. Bump `version` in `package.json` and add the matching `CHANGELOG.md` entry.
2. Check what would ship: `npm pack --dry-run` — the `files` list in the
   manifest is a whitelist, so a new runtime file, locale, or `docs/` asset has
   to be added there or it will be missing from the tarball.
3. Commit and push to `main`.
4. Create a GitHub Release whose tag is `v<version>` — the tag has to match the
   manifest version exactly, or the workflow refuses. Publishing the release
   starts `.github/workflows/publish.yml`, which publishes over npm trusted
   publishing (OIDC): no `NPM_TOKEN` secret exists, and npm attaches provenance
   because the repository is public.
5. A version that is already on npm is skipped, so re-running a release is
   safe. A prerelease version such as `0.2.0-rc.1` goes out under the `next`
   dist-tag and leaves `latest` — what `dsh plugin add` installs — alone.

One-time setup, on the package page (it must exist first):

- **Settings → Trusted Publisher → GitHub Actions**, with `ilyshkafox`,
  `dsh-plusvibe-balance`, `publish.yml`, and the `npm publish` action allowed.
  A new configuration must complete its first publish within two days.
- Optionally **Publishing access → Require two-factor authentication and
  disallow tokens**, so a leaked token cannot publish either.

The workflow file has to be on the default branch for the release event to find
it, and its first successful publish binds the trusted publisher to the
repository.

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

## Релиз (мейнтейнерам)

Шага сборки нет, поэтому релиз — это смена версии и GitHub Release. Публикация в
npm происходит сама.

1. Поднимите `version` в `package.json` и добавьте запись в `CHANGELOG.md`.
2. Посмотрите, что уйдёт в пакет: `npm pack --dry-run` — список `files` в
   манифесте работает как белый список, поэтому новый runtime-файл, локаль или
   ресурс в `docs/` нужно туда добавить, иначе его не будет в tarball.
3. Закоммитьте и запушьте в `main`.
4. Создайте GitHub Release с тегом `v<версия>` — тег должен точно совпадать с
   версией в манифесте, иначе workflow откажется. Публикация релиза запускает
   `.github/workflows/publish.yml`, который публикует через npm trusted publishing
   (OIDC): секрета `NPM_TOKEN` нет, а npm сам прикладывает provenance, потому что
   репозиторий публичный.
5. Версия, которая уже есть на npm, пропускается — перезапускать релиз безопасно.
   Пререлиз вроде `0.2.0-rc.1` уходит под тегом `next` и не трогает `latest` —
   то, что ставит `dsh plugin add`.

Разовая настройка на странице пакета (пакет должен уже существовать):

- **Settings → Trusted Publisher → GitHub Actions**, поля `ilyshkafox`,
  `dsh-plusvibe-balance`, `publish.yml`, разрешённое действие `npm publish`.
  Новая конфигурация должна успеть опубликовать первую версию в течение двух
  суток.
- По желанию **Publishing access → Require two-factor authentication and disallow
  tokens**, чтобы утёкший токен тоже не смог публиковать.

Файл workflow должен лежать в ветке по умолчанию, иначе событие релиза его не
найдёт; первая успешная публикация привязывает trusted publisher к репозиторию.
