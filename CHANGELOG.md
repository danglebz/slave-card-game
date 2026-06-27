# Changelog

ไฟล์นี้สร้างอัตโนมัติด้วย [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) ตามมาตรฐาน [Conventional Commits](https://www.conventionalcommits.org/).

## [1.13.0](https://github.com/Danglebz/slave-card-game/compare/v1.12.0...v1.13.0) (2026-06-27)


### ✨ Features

* opt-in client-side Sentry error tracking ([57ed2d0](https://github.com/Danglebz/slave-card-game/commit/57ed2d0d3c2bb3eaf655a5aac766a4fb8f22f5f2))
* **server:** observability, metrics & per-socket rate limiting ([b7a3f9e](https://github.com/Danglebz/slave-card-game/commit/b7a3f9ee1dad28ec0a4672b186695bbef57eddf6))


### 💄 Styling

* format codebase with prettier + apply eslint autofixes ([96a093e](https://github.com/Danglebz/slave-card-game/commit/96a093ea31b0329dae5678e7bf94af89cda987bc))

## [1.12.0](https://github.com/Danglebz/slave-card-game/compare/v1.11.1...v1.12.0) (2026-06-26)


### ✨ Features

* **avatar:** free color picker (any hex) alongside 8 swatches ([65a5f28](https://github.com/Danglebz/slave-card-game/commit/65a5f2836ebf82542feaabe921d4d5315ba2a40d))
* **avatar:** per-player color identity (phase 3) ([e818df8](https://github.com/Danglebz/slave-card-game/commit/e818df887a92c48a2a2940e56c774c468344de8b))
* **avatar:** replace native color input with Coloris picker ([434b10c](https://github.com/Danglebz/slave-card-game/commit/434b10c7802d0269cd8f09883303dd0ff3e2aaa5))
* **i18n:** TH/EN language toggle for core UI (phase 3) ([edbd016](https://github.com/Danglebz/slave-card-game/commit/edbd01646590a0805e7d1c95e6bf677bbbf0088c))
* **notify:** split turn notification into separate Sound and Vibrate toggles ([08bf388](https://github.com/Danglebz/slave-card-game/commit/08bf388b191c40dad6ad0968217997d934420c87))
* **theme:** light/dark theme toggle via CSS variables (phase 3) ([06b8992](https://github.com/Danglebz/slave-card-game/commit/06b8992301910ae68cbece9d838efce50c1ca990))
* **ux:** connection-status banner on disconnect/reconnect (phase 3) ([d7b148d](https://github.com/Danglebz/slave-card-game/commit/d7b148da852513223ffd36e90ff4cdf98ec12dc9))


### 🐛 Bug Fixes

* **coloris:** reset leaked global button/input styles inside picker popup ([3ca8c22](https://github.com/Danglebz/slave-card-game/commit/3ca8c22a37e7a19fa9e60a9c61b00c37c106f913))


### ♻️ Refactoring

* **avatar:** drop standalone 8-swatch row; Coloris (with its swatches) is the only picker ([07f5a86](https://github.com/Danglebz/slave-card-game/commit/07f5a86fa831e0a3f6473210da93a257a540b4e4))


### 💄 Styling

* **chip:** 75% color tint ([6890db8](https://github.com/Danglebz/slave-card-game/commit/6890db8714e6176d7a2f95e20b21b1d01623c7b2))
* **chip:** color the whole player chip (soft tint) instead of an avatar circle ([c535e45](https://github.com/Danglebz/slave-card-game/commit/c535e454630b4fcd8ab146327179432b13fbb274))
* **chip:** full player color bg + matching border + auto-contrast text ([d70c61e](https://github.com/Danglebz/slave-card-game/commit/d70c61eddc2ddf960de876faea49fba02f38052f))
* **chip:** stronger color tint (40%) ([8f41233](https://github.com/Danglebz/slave-card-game/commit/8f4123328db28ff1e7645c8c748510f0ad29007e))


### 📝 Documentation

* dedupe sound-effects row in roadmap ([9c56e2d](https://github.com/Danglebz/slave-card-game/commit/9c56e2dc7df0740453528d18414ba79828f61167))

## [1.11.1](https://github.com/Danglebz/slave-card-game/compare/v1.11.0...v1.11.1) (2026-06-26)


### 💄 Styling

* **lobby:** corner icons without background/border (icon only) ([0a867fa](https://github.com/Danglebz/slave-card-game/commit/0a867faa050c5f870d5d6ee2f406d8414504668d))
* **lobby:** move install + GitHub to icon buttons in form's top corners ([b2c30c5](https://github.com/Danglebz/slave-card-game/commit/b2c30c5c92cde1aaae48891b7d11fa97ff87ca6e))
* **lobby:** nudge logo down below corner icons ([a334103](https://github.com/Danglebz/slave-card-game/commit/a334103a41ec8de61e39c1d237b6d70036a87e23))
* **lobby:** remove corner icon hover background/focus ring ([1d35625](https://github.com/Danglebz/slave-card-game/commit/1d35625b7bec7769794aef29f5cc50fd31106b14))

## [1.11.0](https://github.com/Danglebz/slave-card-game/compare/v1.10.0...v1.11.0) (2026-06-26)


### ✨ Features

* **pwa:** installable app — manifest, service worker, install button (phase 3) ([d781104](https://github.com/Danglebz/slave-card-game/commit/d781104f9307387b728d8693fe77203ab6e4e523))

## [1.10.0](https://github.com/Danglebz/slave-card-game/compare/v1.9.0...v1.10.0) (2026-06-26)


### ✨ Features

* **lobby:** shuffle seats button (host) to randomize turn order ([9bb7b23](https://github.com/Danglebz/slave-card-game/commit/9bb7b2332c9a9f1352d61141a62aaec92fcb19c8))
* **spectator:** watch mid-game, auto-join next round (phase 2) ([868b80a](https://github.com/Danglebz/slave-card-game/commit/868b80a2295f3cb5363d244bb33c4b9a8b706637))

## [1.9.0](https://github.com/Danglebz/slave-card-game/compare/v1.8.0...v1.9.0) (2026-06-26)


### ✨ Features

* **bot:** AI players to fill seats (phase 2) ([b6824b1](https://github.com/Danglebz/slave-card-game/commit/b6824b1c38462237e00921e0c4271db1b6a655e2))

## [1.8.0](https://github.com/Danglebz/slave-card-game/compare/v1.7.0...v1.8.0) (2026-06-26)


### ✨ Features

* **anim:** card-play pile animation (stagger-in + bomb shake) ([7a4cf28](https://github.com/Danglebz/slave-card-game/commit/7a4cf2880792bf99d90454f2c9a61fb7476e5c40))
* **settings:** host-selectable turn duration (15/30/45/60s) ([bd99857](https://github.com/Danglebz/slave-card-game/commit/bd998574f6a841f3a9b504776df76d78baf90327))


### 🐛 Bug Fixes

* **sfx:** bomb sound audible on small speakers (triangle 300->110Hz + click), still soft ([d8624f1](https://github.com/Danglebz/slave-card-game/commit/d8624f1d96f9ceaaa127379193c826d43ea9853d))
* **sfx:** softer bomb sound (pure sine pitch-drop, lower gain) to avoid harsh/clipping audio ([fdc1a2a](https://github.com/Danglebz/slave-card-game/commit/fdc1a2a4149417d0f9c5ac844625320bd7b47b89))

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
