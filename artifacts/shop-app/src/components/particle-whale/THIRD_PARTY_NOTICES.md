# Third-Party Notices

本資料夾（particle-whale-package，自 whale/ 封裝交付）内之粒子鯨魚元件（js/）改寫自以下開源專案。

## 1. dsh-particle-whale（上游來源）

- Source: https://github.com/zepeng-jin/dsh-particle-whale
- Purpose: Three.js particle whale geometry, shader and animation concepts
- License declared by upstream: MIT
- Files adapted:
  - js/whaleConstants.js（WHALE_PATH、GRID_SIZE、LIGHT_DEFAULTS；新增定案 HERO_SIZE=280、HERO_OPACITY=1.0）
  - js/whaleData.js（體積粒子資料生成，新增 gridSize 參數化與 spacing 等比縮放）
  - js/whaleShaders.js（頂點／片元 Shader）
  - js/createParticleWhale.js（容器化元件，新增 gridSize 選項與 getStats()；debugSetAssembly 標註 TEST/DEBUG）

Upstream MIT License text:

MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## 2. Three.js

- Source: https://github.com/mrdoob/three.js
- Package: three（本專案以 pnpm 安裝並釘死 0.185.1，由 Vite 建置）
- License: MIT（see https://github.com/mrdoob/three.js/blob/dev/LICENSE）

  MIT License

  Copyright © 2010-2025 three.js authors

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.

## 3. 本專案自產內容（無第三方授權義務）

- radar.css：自本專案 whale/index.html 抽出之 .rings／.sweep／@keyframes radar（原檔未修改），
  屬本專案自行撰寫之樣式，無第三方授權義務。
- demo.html、README.md：本專案撰寫。

## Integration policy

- 上游程式碼非原創，改寫檔均已於檔案標頭註明來源。
- DSH/Cordis/React runtime 相關程式碼未複製。
- 正式產品由 `SonarBackground.tsx` 動態載入粒子鯨魚控制器，再由該控制器載入 `three@0.185.1`；Vite 將其保留在非入口的非同步 chunk，避免 Three.js 進入主包。
