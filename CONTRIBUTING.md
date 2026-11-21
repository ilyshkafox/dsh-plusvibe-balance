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
   node scripts/check.mjs
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

## Listing in plugin marketplaces (maintainers)

The plugin market inside DSH (`dshmarket`) ships no catalog of its own: it reads the
curated [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
registry on every open, and it installs nothing that is not in it. So "publishing to the
market" is one pull request there — there is no form to fill in.

1. **The repository topic.** Every directory finds plugins through the `dsh-plugin`
   GitHub topic; without it this repository is invisible to all of them:

   ```sh
   gh repo edit --add-topic dsh-plugin --add-topic deepseek-harness
   ```

2. **The assets the storefronts read.** `assets/icon.png` is the card tile and
   `screenshots.json` lists the images for the carousel. Only a GitHub-hosted raster
   image is accepted as an icon — `icon.svg` is refused — and the URL in the entry has
   to resolve on `main`, so push the asset before opening the pull request.

3. **The entry.** Copy `contrib/awesome-dsh-plugin-entry.yml` into a fork as
   `data/plugins/ilyshkafox__dsh-plusvibe-balance.yml`, then open one pull request. Do
   not edit that repository's READMEs; they are generated from `data/plugins/*.yml`.

What that registry checks: a `dsh.bundle` manifest, a repository at least a day old,
real code, the topic, and a description that matches the code. The npm package is
optional there and is linked automatically through the `repository` field — an `npm:`
key written into the entry is rejected.

The other directories need nothing beyond the topic: [dsh-plugin.org](https://dsh-plugin.org),
[dshmarketplace.dev](https://dshmarketplace.dev) and
[dshmarketplace.com](https://www.dshmarketplace.com) scan it, and
[dsh-plugin.market](https://dsh-plugin.market) crawls GitHub directly.
[harnesscatalog.com](https://harnesscatalog.com) is editorial and takes no submissions.

## По-русски

Спасибо, что заглянули. Плагин маленький, поэтому полезнее всего: подробные
сообщения об ошибках и небольшие правки.

Вопросы и всё, что не помещается в issue: <ilyshkafox@mail.ru>.

### Перед pull request

1. Прогоните проверки:
   ```sh
   node --check index.js
   node --check client.js
   node scripts/check.mjs
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

## Публикация в маркетплейсах (мейнтейнерам)

У магазина плагинов внутри DSH (`dshmarket`) своего каталога нет: он при каждом
открытии читает курируемый реестр
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) и не
ставит ничего, чего в нём нет. Поэтому «опубликовать в маркете» — это один pull request
туда, а не форма, которую надо заполнить.

1. **Тема репозитория.** Каталоги находят плагины по теме `dsh-plugin` на GitHub; без
   неё репозиторий не видит ни один из них:

   ```sh
   gh repo edit --add-topic dsh-plugin --add-topic deepseek-harness
   ```

2. **Ресурсы, которые читают витрины.** `assets/icon.png` — плитка карточки, а
   `screenshots.json` перечисляет картинки для карусели. В качестве иконки принимается
   только растровая картинка на GitHub — `icon.svg` отклоняется, — и адрес из записи
   должен уже открываться на `main`, поэтому ресурс пушится до pull request'а.

3. **Запись.** Скопируйте `contrib/awesome-dsh-plugin-entry.yml` в форк как
   `data/plugins/ilyshkafox__dsh-plusvibe-balance.yml` и откройте один pull request.
   README того репозитория руками не правятся: они генерируются из `data/plugins/*.yml`.

Что проверяет этот реестр: манифест `dsh.bundle`, возраст репозитория не меньше суток,
реальный код, тему и описание, которое совпадает с кодом. npm-пакет там не обязателен и
привязывается сам через поле `repository` — ключ `npm:`, вписанный в запись, отклоняется.

Остальным каталогам не нужно ничего, кроме темы:
[dsh-plugin.org](https://dsh-plugin.org), [dshmarketplace.dev](https://dshmarketplace.dev)
и [dshmarketplace.com](https://www.dshmarketplace.com) её сканируют, а
[dsh-plugin.market](https://dsh-plugin.market) обходит GitHub напрямую.
[harnesscatalog.com](https://harnesscatalog.com) — редакционный, заявок не принимает.

