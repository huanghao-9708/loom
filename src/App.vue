<script setup lang="ts">
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

const greetMsg = ref("");
const name = ref("Loom User");

async function greet() {
  greetMsg.value = await invoke("greet", { name: name.value });
}
</script>

<template>
  <div class="flex flex-col h-screen w-screen bg-bg-base text-text-primary overflow-hidden font-sans select-none antialiased">
    <!-- 顶部状态条 (工业仪器风格) -->
    <header class="h-8 border-b border-border-light flex items-center justify-between px-4 text-[10px] tracking-widest font-mono text-text-secondary uppercase">
      <div class="flex items-center gap-4">
        <span>DEVICE: LOOM-STATION v1.0.0</span>
        <span class="flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full bg-accent animate-pulse"></span>
          SYS ACTIVE
        </span>
      </div>
      <div class="flex items-center gap-6">
        <span>VFS: CONNECTED</span>
        <span>LATENCY: 4ms</span>
        <span>DB: OK</span>
      </div>
    </header>

    <!-- 中部主工作区 (左中右布局) -->
    <div class="flex-1 flex min-h-0">
      
      <!-- 1. 左侧导航栏 -->
      <aside class="w-52 border-r border-border-light flex flex-col justify-between p-4 bg-bg-surface font-mono">
        <div class="space-y-6">
          <div>
            <div class="text-[10px] tracking-wider text-text-secondary uppercase mb-2">Library</div>
            <ul class="space-y-1 text-xs">
              <li class="px-2 py-1 bg-text-primary text-bg-surface cursor-pointer flex items-center justify-between">
                <span>ALL FILES</span>
                <span class="text-[9px]">402</span>
              </li>
              <li class="px-2 py-1 hover:bg-bg-base cursor-pointer flex items-center justify-between">
                <span>MUSIC</span>
                <span class="text-[9px] text-text-secondary">128</span>
              </li>
              <li class="px-2 py-1 hover:bg-bg-base cursor-pointer flex items-center justify-between">
                <span>BOOKS</span>
                <span class="text-[9px] text-text-secondary">64</span>
              </li>
              <li class="px-2 py-1 hover:bg-bg-base cursor-pointer flex items-center justify-between">
                <span>DOCUMENTS</span>
                <span class="text-[9px] text-text-secondary">210</span>
              </li>
            </ul>
          </div>

          <div>
            <div class="text-[10px] tracking-wider text-text-secondary uppercase mb-2">Sources</div>
            <ul class="space-y-1 text-xs">
              <li class="px-2 py-1 hover:bg-bg-base cursor-pointer flex items-center gap-1.5">
                <span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
                <span>LOCAL DISK</span>
              </li>
              <li class="px-2 py-1 hover:bg-bg-base cursor-pointer flex items-center gap-1.5">
                <span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
                <span>WEBDAV (坚果云)</span>
              </li>
            </ul>
          </div>
        </div>

        <!-- 底侧 Tauri 诊断面板 -->
        <div class="border-t border-border-light pt-4 space-y-2">
          <div class="text-[9px] tracking-wider text-text-secondary uppercase">Tauri Core Greet Test</div>
          <div class="flex gap-1">
            <input 
              v-model="name"
              type="text" 
              class="w-full bg-bg-base border border-border-light px-1.5 py-1 text-[10px] focus:outline-none focus:border-accent text-text-primary font-mono"
            />
            <button 
              @click="greet"
              class="bg-text-primary text-bg-surface text-[10px] px-2 hover:bg-accent hover:text-bg-surface transition-colors cursor-pointer font-bold"
            >
              RUN
            </button>
          </div>
          <div v-if="greetMsg" class="text-[9px] font-mono text-accent leading-tight break-all border border-dashed border-accent/30 p-1 bg-accent/5">
            {{ greetMsg }}
          </div>
        </div>
      </aside>

      <!-- 2. 中间文件浏览器 (密集的表格形式) -->
      <main class="flex-1 flex flex-col min-w-0 bg-bg-base">
        <!-- 工具栏 -->
        <div class="h-9 border-b border-border-light flex items-center justify-between px-4 bg-bg-surface font-mono text-xs">
          <div class="flex items-center gap-4">
            <button class="hover:text-accent font-bold">↑ PARENT</button>
            <span class="text-text-secondary">/ WebDAV / Music / Lumo_Tracks /</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-text-secondary">SEARCH:</span>
            <input type="text" placeholder="..." class="bg-bg-base border border-border-light px-2 py-0.5 text-xs w-32 focus:outline-none focus:border-accent" />
          </div>
        </div>

        <!-- 密集的音轨/文件列表 -->
        <div class="flex-1 overflow-y-auto no-scrollbar">
          <table class="w-full text-left border-collapse font-mono text-xs">
            <thead>
              <tr class="border-b border-border-light bg-bg-surface text-text-secondary text-[10px] sticky top-0 uppercase">
                <th class="py-2 px-4 font-normal">#</th>
                <th class="py-2 px-4 font-normal">Title / File Name</th>
                <th class="py-2 px-4 font-normal">Format</th>
                <th class="py-2 px-4 font-normal">Size</th>
                <th class="py-2 px-4 font-normal text-right">Bitrate</th>
              </tr>
            </thead>
            <tbody>
              <!-- Row 1 (Active) -->
              <tr class="border-b border-border-light hover:bg-bg-surface cursor-pointer bg-text-primary text-bg-surface">
                <td class="py-2 px-4 w-8 font-bold text-accent">▶</td>
                <td class="py-2 px-4 font-bold flex items-center gap-2">
                  <span class="truncate">01. Synthesizer Melancholy.mp3</span>
                </td>
                <td class="py-2 px-4 text-accent">MP3</td>
                <td class="py-2 px-4">8.4 MB</td>
                <td class="py-2 px-4 text-right">320kbps</td>
              </tr>
              <!-- Row 2 -->
              <tr class="border-b border-border-light hover:bg-bg-surface cursor-pointer">
                <td class="py-2 px-4 w-8 text-text-secondary">02</td>
                <td class="py-2 px-4 truncate">02. OP-1 Ambient Sketch.wav</td>
                <td class="text-text-secondary py-2 px-4">WAV</td>
                <td class="py-2 px-4">42.1 MB</td>
                <td class="py-2 px-4 text-right text-text-secondary">1411kbps</td>
              </tr>
              <!-- Row 3 -->
              <tr class="border-b border-border-light hover:bg-bg-surface cursor-pointer">
                <td class="py-2 px-4 w-8 text-text-secondary">03</td>
                <td class="py-2 px-4 truncate">03. FM-Station Jam Session.flac</td>
                <td class="text-text-secondary py-2 px-4">FLAC</td>
                <td class="py-2 px-4">28.7 MB</td>
                <td class="py-2 px-4 text-right text-text-secondary">920kbps</td>
              </tr>
              <!-- Row 4 -->
              <tr class="border-b border-border-light hover:bg-bg-surface cursor-pointer">
                <td class="py-2 px-4 w-8 text-text-secondary">04</td>
                <td class="py-2 px-4 truncate">04. Loom Virtual File System Specs.pdf</td>
                <td class="text-text-secondary py-2 px-4">PDF</td>
                <td class="py-2 px-4">1.2 MB</td>
                <td class="py-2 px-4 text-right text-text-secondary">--</td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>

      <!-- 3. 右侧 Now Playing 面板 -->
      <aside class="w-64 border-l border-border-light flex flex-col p-4 bg-bg-surface justify-between">
        <div class="space-y-4">
          <div class="text-[10px] tracking-wider font-mono text-text-secondary uppercase">Now Playing</div>
          <!-- 硬件拟物风格的封面区域 -->
          <div class="aspect-square bg-bg-base border border-border-light flex items-center justify-center p-6 relative overflow-hidden">
            <!-- 唱片纹路模拟 -->
            <div class="absolute inset-2 rounded-full border border-border-light/40 flex items-center justify-center">
              <div class="h-16 w-16 rounded-full border border-border-light/60 flex items-center justify-center bg-bg-surface">
                <div class="h-4 w-4 rounded-full bg-accent"></div>
              </div>
            </div>
            <div class="z-10 text-center font-mono space-y-1">
              <div class="text-[9px] text-text-secondary uppercase">TRACK 01</div>
              <div class="text-xs font-bold uppercase tracking-wider text-accent">LOOM-STATION</div>
            </div>
          </div>

          <div class="space-y-1 font-mono">
            <h2 class="text-sm font-bold truncate">Synthesizer Melancholy</h2>
            <p class="text-xs text-text-secondary truncate">Artist: Lumo Audio Project</p>
            <p class="text-[10px] text-text-secondary">Album: OP-1 Sketched Memories</p>
          </div>
        </div>

        <!-- 硬件参数监视器 -->
        <div class="border-t border-border-light pt-4 font-mono space-y-1 text-[10px]">
          <div class="flex justify-between">
            <span class="text-text-secondary">DECODER</span>
            <span>JS-WASM / SYMPHONIA</span>
          </div>
          <div class="flex justify-between">
            <span class="text-text-secondary">SAMPLE RATE</span>
            <span>44.1 kHz / 24-bit</span>
          </div>
          <div class="flex justify-between">
            <span class="text-text-secondary">BUFFER MODE</span>
            <span>RANGE / MEM-STREAM</span>
          </div>
        </div>
      </aside>
    </div>

    <!-- 底部控制栏 (硬件面板隐喻) -->
    <footer class="h-16 border-t border-border-light bg-bg-surface flex items-center justify-between px-6 font-mono">
      <!-- 播放操作按键 -->
      <div class="flex items-center gap-1">
        <button class="h-8 w-8 border border-border-light flex items-center justify-center text-xs hover:bg-bg-base cursor-pointer">⏮</button>
        <button class="h-9 w-12 border border-border-light flex items-center justify-center text-sm bg-text-primary text-bg-surface hover:bg-accent hover:text-bg-surface transition-colors cursor-pointer font-bold">▶</button>
        <button class="h-8 w-8 border border-border-light flex items-center justify-center text-xs hover:bg-bg-base cursor-pointer">⏸</button>
        <button class="h-8 w-8 border border-border-light flex items-center justify-center text-xs hover:bg-bg-base cursor-pointer">⏭</button>
      </div>

      <!-- 进度条刻度尺 -->
      <div class="flex-1 max-w-xl mx-8 space-y-1">
        <div class="flex justify-between text-[9px] text-text-secondary">
          <span>01:14</span>
          <span>MEASURE SCALE (SEC)</span>
          <span>03:45</span>
        </div>
        <!-- 精密测量标尺效果 -->
        <div class="h-3 relative flex items-end select-none">
          <!-- 刻度线 -->
          <div class="absolute inset-x-0 bottom-0 h-1.5 flex justify-between">
            <span v-for="i in 21" :key="i" class="h-full w-[1px] bg-border-light" :class="{ 'h-2 bg-text-secondary': i % 5 === 1 }"></span>
          </div>
          <!-- 进度条轨道 -->
          <div class="absolute inset-x-0 bottom-1 h-[2px] bg-border-light"></div>
          <!-- 激活的进度条 -->
          <div class="absolute left-0 bottom-1 h-[2px] bg-accent" style="width: 33%"></div>
          <!-- 橙色滑块 (TE风格小圆点) -->
          <div class="absolute h-2 w-2 rounded-full bg-accent" style="left: 33%; transform: translate(-50%, 25%)"></div>
        </div>
      </div>

      <!-- 音量与辅助控制器 -->
      <div class="flex items-center gap-4 text-xs">
        <div class="flex items-center gap-2">
          <span class="text-text-secondary">VOL:</span>
          <!-- 精密模拟滑块 -->
          <div class="w-16 h-1.5 bg-border-light relative cursor-pointer">
            <div class="absolute left-0 top-0 h-full bg-text-primary" style="width: 70%"></div>
            <div class="absolute h-3 w-1.5 bg-text-primary top-1/2 -translate-y-1/2" style="left: 70%"></div>
          </div>
        </div>
        <span class="text-[10px] text-text-secondary">MONO</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* 可以在这里添加一些 scoped 样式，但大部分样式直接交给 Tailwind CSS 处理 */
</style>