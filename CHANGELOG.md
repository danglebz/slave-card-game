# Changelog

ไฟล์นี้สร้างอัตโนมัติด้วย [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) ตามมาตรฐาน [Conventional Commits](https://www.conventionalcommits.org/).

## [1.7.0](https://github.com/Danglebz/slave-card-game/compare/v1.6.0...v1.7.0) (2026-06-26)


### ✨ Features

* **sfx:** split sound effects into 3 toggles (play/bomb/win) ([b82bc92](https://github.com/Danglebz/slave-card-game/commit/b82bc92a4c6d6e9308d072eacb8e11518a5b8c28))
* **sfx:** synthesized sound effects; hide QR share button for now ([71ceedf](https://github.com/Danglebz/slave-card-game/commit/71ceedfbf06d0e3aa8f42d55f7b5ff78c625a477))


### 💄 Styling

* **settings:** make the 3 sfx rows full-size, matching the notification row ([1b66ed5](https://github.com/Danglebz/slave-card-game/commit/1b66ed5e901ed2025efe66d043782dc55dab6673))

## [1.6.0](https://github.com/Danglebz/slave-card-game/compare/v1.5.0...v1.6.0) (2026-06-26)


### ✨ Features

* **share:** QR code room invite (phase 2) ([845540c](https://github.com/Danglebz/slave-card-game/commit/845540ca3e4fbc984db6531a682ceed66893ab27))

## [1.5.0](https://github.com/Danglebz/slave-card-game/compare/v1.4.0...v1.5.0) (2026-06-26)


### ✨ Features

* **game:** add per-turn timer with auto-pass/auto-play on timeout ([d3f1ace](https://github.com/Danglebz/slave-card-game/commit/d3f1acefbd62e2e0ac4b00d7827423105dc82ebe))
* **ui:** settings menu (gear) with room + personal options ([cc8411d](https://github.com/Danglebz/slave-card-game/commit/cc8411da7b1308a20b7d879c00de81064ab67646))


### 🐛 Bug Fixes

* **icons:** register settings/timer/bell/message-circle/users icons ([275e9ac](https://github.com/Danglebz/slave-card-game/commit/275e9accaef4e28298db13b7157ba98cbc0ec0fa))

## [1.4.0](https://github.com/Danglebz/slave-card-game/compare/v1.3.0...v1.4.0) (2026-06-26)


### ✨ Features

* **ui:** players-around-the-table seats layout; fix bomb-sort chaining for overlapping bombs & toast re-trigger ([3493a4d](https://github.com/Danglebz/slave-card-game/commit/3493a4d479f55bc414fb0ed708699d0141788cd6))


### 🐛 Bug Fixes

* **game:** clearer play-rejection messages; dethrone (miyako-ochi) exchanges only king↔slave ([5d41f40](https://github.com/Danglebz/slave-card-game/commit/5d41f40b71480fc904f7efabe11549258b2ebcfa))

## [1.3.0](https://github.com/Danglebz/slave-card-game/compare/v1.2.0...v1.3.0) (2026-06-26)


### ✨ Features

* **ui:** leave-room confirm AlertDialog, loading states (progress bar + button spinner), Sonner toast top-center ([106da9b](https://github.com/Danglebz/slave-card-game/commit/106da9b2cba939cdcea8230041f8132f26d2fe97))


### 💄 Styling

* move version label next to GitHub button in lobby footer ([4db5ddf](https://github.com/Danglebz/slave-card-game/commit/4db5ddfcfa39158e535d6856063e5c2f3c5c67a3))
* version label as plain text, remove badge background ([627ca3b](https://github.com/Danglebz/slave-card-game/commit/627ca3b6cb9697852ebc9f95e417fda96138be94))


### 📝 Documentation

* add feature roadmap (planned pages, features, phases) ([f779a45](https://github.com/Danglebz/slave-card-game/commit/f779a45285747d5a9300023456f79322f3f15f96))

## [1.2.0](https://github.com/Danglebz/slave-card-game/compare/v1.1.0...v1.2.0) (2026-06-26)


### ✨ Features

* **ui:** Lucide icons, shadcn dialog/toast, Valibot form validation, leave-room button ([4a0c102](https://github.com/Danglebz/slave-card-game/commit/4a0c102639e2213ed3744f2aec4d7d30f1b51f5c))

## 1.1.0 (2026-06-26)


### ✨ Features

* rules modal + GitHub repo link on lobby ([6e3089d](https://github.com/Danglebz/slave-card-game/commit/6e3089dd2b6298f9b519bb3462da284ef2a749ee))


### 🐛 Bug Fixes

* rejoin race on refresh — claim seat by name regardless of stale socket ([80e2864](https://github.com/Danglebz/slave-card-game/commit/80e286434b19d1509f964186172d2a5f18a98cf2))


### 💄 Styling

* light violet theme, GitHub button in footer, remove card emoji ([5a87db3](https://github.com/Danglebz/slave-card-game/commit/5a87db3f0945a4fc5234fb8267c2c3307b5f89ce))
* restyle UI to shadcn-like dark theme (zinc surfaces, subtle borders, focus rings, gold primary) ([f47286b](https://github.com/Danglebz/slave-card-game/commit/f47286b034ced509a9c21894202287fb85175087))


### 📝 Documentation

* add live demo link (Render) ([f829877](https://github.com/Danglebz/slave-card-game/commit/f8298777c0e5234097e33af1140f0de9ae4bd376))
* full game rules in README (bombs/reverse/tribute/dethrone) + deploy guide ([28a350c](https://github.com/Danglebz/slave-card-game/commit/28a350c6a5f9215158aa8b8da63464644eedfbc7))


### 📦 Build

* migrate client to Vite + Tailwind (vanilla JS), serve dist/ from Express ([1820b98](https://github.com/Danglebz/slave-card-game/commit/1820b98259eca79a56a9f6bc9b5850acbfb67d49))
