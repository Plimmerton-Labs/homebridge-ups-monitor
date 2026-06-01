## [1.4.11](https://github.com/GodIsI/homebridge-ups-monitor/compare/v1.4.9-beta.184...v1.4.11) (2026-06-01)

### Features

* NUT control commands — audible-alarm switch + low-battery threshold sync (opt-in) ([aef88fe](https://github.com/GodIsI/homebridge-ups-monitor/commit/aef88fe9fe3e5c989503e13c8bdb87235b05f0a3))
* reactive dashboard link in settings UI (Feature 7) ([#91](https://github.com/GodIsI/homebridge-ups-monitor/issues/91)) ([7a3d57f](https://github.com/GodIsI/homebridge-ups-monitor/commit/7a3d57f4c47613c3a1e8fe689a24a4d2b2df3140))
* store data files in a dedicated subdirectory (Feature 10) ([#97](https://github.com/GodIsI/homebridge-ups-monitor/issues/97)) ([f2ecb1a](https://github.com/GodIsI/homebridge-ups-monitor/commit/f2ecb1a50f57dfdf83a1ab7ea4fe1c541398a22b))

## [1.4.9-beta.184](https://github.com/GodIsI/homebridge-ups-monitor/compare/v1.4.8-beta.182...v1.4.9-beta.184) (2026-05-31)

### Features

* automate CHANGELOG from commits; align beta npm version with release tag ([9d62bf6](https://github.com/GodIsI/homebridge-ups-monitor/commit/9d62bf64a1ac18c92ec41c64f7b9f5efef4e1756))
* validate standalonePort range in index.js with tests ([dd54a24](https://github.com/GodIsI/homebridge-ups-monitor/commit/dd54a246e94109e64d5203dc0bfc4b86b96507d3))

### Bug Fixes

* render standalonePort as numeric input instead of slider ([28a7efe](https://github.com/GodIsI/homebridge-ups-monitor/commit/28a7efebf35a3afa4e0da3961e77531037ca372e))
* set singular:true in config.schema.json ([cb1b3ef](https://github.com/GodIsI/homebridge-ups-monitor/commit/cb1b3ef864f3745bcf730a29f1298575f56002dd))
* standalone dashboard config, chart time-range with 12h option, and ~24h history retention ([743ec8d](https://github.com/GodIsI/homebridge-ups-monitor/commit/743ec8d60c9e35ec97c918e3ae46f9dc62277e79))
* standalone dashboard config, chart time-range with 12h option, and ~24h history retention ([8a5a841](https://github.com/GodIsI/homebridge-ups-monitor/commit/8a5a84121b39445add8bcd4ae61fda61fbe27c5b))

## [1.3.5-beta.139](https://github.com/GodIsI/homebridge-ups-monitor/compare/v1.3.4-beta.77...v1.3.5-beta.139) (2026-05-30)

## [1.2.1-beta.68](https://github.com/GodIsI/homebridge-ups-monitor/compare/v1.2.0...v1.2.1-beta.68) (2026-05-30)

### Features

* **2b/2c:** add DailyLog for 30-day per-day CSV history ([cbe84e1](https://github.com/GodIsI/homebridge-ups-monitor/commit/cbe84e13ffd5a7257b048ebcc32368e740d01a49))
* **3:** log export — CSV download from dashboard ([3cedd75](https://github.com/GodIsI/homebridge-ups-monitor/commit/3cedd75f86515f4c8755eb38b23604badf960523))
* add ESLint (flat config, CI lint job, zero errors) ([65097ca](https://github.com/GodIsI/homebridge-ups-monitor/commit/65097ca24eb7129cd6b47757ab926f76067f613d))
* Feature 4 — Export & Share with Web Share API ([9367a35](https://github.com/GodIsI/homebridge-ups-monitor/commit/9367a356b089b0ac5ddee0b713bc949fda355dc2))
* npm publish on release + beta, add CI badge ([94a6236](https://github.com/GodIsI/homebridge-ups-monitor/commit/94a6236f61a24e100dac212d6330607b3c932bec))
* standalone dashboard server (Feature 5) ([9b6e873](https://github.com/GodIsI/homebridge-ups-monitor/commit/9b6e873e03fe2708c7e967b4f7a270fefd2b4765))

### Bug Fixes

* deploy.sh — use /var/lib/homebridge path and install UI dependency ([4f28a41](https://github.com/GodIsI/homebridge-ups-monitor/commit/4f28a41686a061ebe9301bc096db6d82699210ee))
* pin @homebridge/plugin-ui-utils to ^2.0.0 (fixes Socket wildcard dep flag) ([01e5114](https://github.com/GodIsI/homebridge-ups-monitor/commit/01e5114df972201345518403caefeecade393796))
* quote if-expressions in beta.yml and release.yml to fix YAML syntax error ([f5cae04](https://github.com/GodIsI/homebridge-ups-monitor/commit/f5cae04262c1a5b8700d93ba41517f713b69b04a))
* replace getPluginConfig() with direct config.json read ([c250e19](https://github.com/GodIsI/homebridge-ups-monitor/commit/c250e1948af5927d5454267ac8b17c8ff09c0add))
* use direct download on desktop, native share sheet on mobile only ([d8d059b](https://github.com/GodIsI/homebridge-ups-monitor/commit/d8d059bea4a912e7e96425c6883de3732e40601b))
* use PAT_VERSION_BUMP for create-pull-request action ([19d8439](https://github.com/GodIsI/homebridge-ups-monitor/commit/19d8439aa139054fe329ebefca95a1522322a4b0))

## [1.0.0-beta.6](https://github.com/GodIsI/homebridge-ups-monitor/compare/v1.0.0-beta.5...v1.0.0-beta.6) (2026-05-26)
