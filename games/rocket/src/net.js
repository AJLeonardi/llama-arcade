import qrcode from 'qrcode-generator';
import jsQR from 'jsqr';
import { Sfx, game, toast } from './core.js';
import { PLANETS, PLAYER_SCARF } from './data.js';
import { Coop } from './coop.js';
/* Two-device play over WebRTC with no server. Both devices open "Play Together", which shows their own QR code
   and their front camera on one screen. Hold the screens facing each other and they pair by themselves:
   - each device shows an "offer" QR with a random id
   - the device with the bigger id becomes the guest when it sees the other's offer, and swaps its QR to an "answer"
   - the device with the smaller id (the host) connects when it sees that answer.
   Both devices must be on the same Wi-Fi (no internet server is used). */

const Net = {
  connected: false,
  role: null,          // 'host' | 'guest' | null
  friend: null,        // latest state the friend sent us
  seed: Math.floor(Math.random() * 1e6) + 1,
  myId: '',
  pc: null, dc: null,
  lastPos: 0, lastStatus: 0,

  myScarf() { return PLAYER_SCARF[this.role === 'guest' ? 1 : 0]; },
  friendScarf() { return PLAYER_SCARF[this.role === 'guest' ? 0 : 1]; },
  friendName() { return this.role === 'guest' ? 'Llama 1' : 'Llama 2'; },
  friendLabel() {
    if (!this.connected) return '';
    const f = this.friend || {};
    const where = {
      house: 'in the house', bay: 'in the Rocket Bay', builder: 'building a rocket', launch: 'launching!',
      space: f.leg != null && PLANETS[f.leg] ? `flying to ${PLANETS[f.leg].name}` : 'in space',
      planet: f.planet != null ? `on ${PLANETS[f.planet].name}` : 'on a planet', win: 'on Planet Evil!', title: 'on the title screen',
    }[f.scene] || 'connected';
    return `🦙 ${this.friendName()}: ${where}`;
  },

  send(msg) {
    if (this.dc && this.dc.readyState === 'open') { try { this.dc.send(JSON.stringify(msg)); } catch (e) { /* dropped */ } }
  },
  sendStatus() {
    if (!this.connected) return;
    this.send({ t: 'status', scene: game.sceneName, design: game.save.design });
  },
  sendPos(obj) {
    if (!this.connected) return;
    const now = performance.now();
    if (now - this.lastPos < 66) return;   // ~15 times a second
    this.lastPos = now;
    this.send({ t: 'pos', ...obj });
  },
  tick() {
    if (!this.connected) return;
    const now = performance.now();
    if (now - this.lastStatus > 1500) { this.lastStatus = now; this.sendStatus(); }
  },
  onMessage(msg) {
    if (msg.t === 'hello') { if (this.role === 'guest' && msg.seed) this.seed = msg.seed; return; }
    if (['ready', 'unready', 'go', 'answer'].includes(msg.t)) { Coop.onMessage(msg); return; }
    this.friend = Object.assign(this.friend || {}, msg);
    if (msg.t === 'status' && msg.scene !== 'planet' && msg.scene !== 'space') this.friend.planet = null;
  },

  // ---------- WebRTC ----------
  newPeer() {
    if (this.pc) try { this.pc.close(); } catch (e) { /* ignore */ }
    this.connected = false;
    this.friend = null;
    const pc = this.pc = new RTCPeerConnection({ iceServers: [] });   // same Wi-Fi only, no internet needed
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      const s = pc.connectionState;
      if ((s === 'failed' || s === 'disconnected' || s === 'closed') && this.connected) this.dropped();
    };
  },
  wireChannel(dc) {
    this.dc = dc;
    dc.onopen = () => {
      this.connected = true;
      if (this.role === 'host') this.send({ t: 'hello', seed: this.seed });
      this.sendStatus();
      Sfx.win();
      toast(`Connected! You are ${this.role === 'host' ? 'Llama 1 🧡' : 'Llama 2 💙'}`, '#7bdc6b');
      Pair.close();
    };
    dc.onmessage = e => { try { this.onMessage(JSON.parse(e.data)); } catch (err) { /* bad message */ } };
    dc.onclose = () => { if (this.connected && dc === this.dc) this.dropped(); };
  },
  dropped() {
    this.connected = false;
    this.friend = null;
    Coop.dropped();
    toast('Your friend got disconnected. Keep playing solo!', '#ffb3b3');
  },
  waitForIce() {
    const pc = this.pc;
    return new Promise(res => {
      if (pc.iceGatheringState === 'complete') return res();
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') res(); });
      setTimeout(res, 3000);
    });
  },
  // Step 1 (both devices): make an offer to show as a QR code.
  async prepare() {
    this.role = null;
    this.myId = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
    this.newPeer();
    this.wireChannel(this.pc.createDataChannel('game'));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await this.waitForIce();
    return encodeCode('O', this.myId, '000000', this.pc.localDescription.sdp);
  },
  // Step 2 (both devices): handle whatever QR code the camera saw.
  // Returns a new code to show (the answer) when this device becomes the guest, otherwise null.
  async handleCode(code) {
    const c = await decodeCode(code);
    if (c.from === this.myId) return null;                       // saw our own code in a reflection
    if (c.kind === 'O') {
      if (this.role || this.myId < c.from) return null;          // we're the host: wait for their answer
      this.role = 'guest';
      this.newPeer();
      this.pc.ondatachannel = e => this.wireChannel(e.channel);
      await this.pc.setRemoteDescription({ type: 'offer', sdp: c.sdp });
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      await this.waitForIce();
      return encodeCode('A', this.myId, c.from, this.pc.localDescription.sdp);
    }
    if (c.kind === 'A' && c.to === this.myId && !this.role) {
      this.role = 'host';
      await this.pc.setRemoteDescription({ type: 'answer', sdp: c.sdp });
    }
    return null;
  },
};

// ---------- Connection codes: SDP -> compressed -> base64 so it fits in one QR code ----------
// Format: "LRB" + kind (O/A) + from id (6) + to id (6) + packing (z/p) + data
function toB64(bytes) { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function fromB64(str) { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); }
async function pipeBytes(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
function trimSdp(sdp) {
  // keep only lines a data-channel connection needs
  return sdp.split('\r\n').filter(l => l && !/^a=(extmap|rtcp-fb|ssrc|msid-semantic|ice-options)/.test(l)).map(l => l.replace(/ generation \d+ network-cost \d+$/, '')).join('\r\n') + '\r\n';
}
async function encodeCode(kind, from, to, sdp) {
  const raw = new TextEncoder().encode(trimSdp(sdp)), head = 'LRB' + kind + from + to;
  if (window.CompressionStream) return head + 'z' + toB64(await pipeBytes(raw, new CompressionStream('deflate-raw')));
  return head + 'p' + toB64(raw);
}
async function decodeCode(code) {
  code = (code || '').trim();
  if (!code.startsWith('LRB') || code.length < 20) throw new Error("That doesn't look like a Llama Rocket code.");
  const kind = code[3], from = code.slice(4, 10), to = code.slice(10, 16), packed = code[16], bytes = fromB64(code.slice(17));
  const raw = packed === 'z' ? await pipeBytes(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return { kind, from, to, sdp: new TextDecoder().decode(raw) };
}

// ---------- "Play Together" screen: my QR code + my camera, side by side ----------
const Pair = {
  el: null, stream: null, scanning: false, busy: false,
  async open() {
    if (Net.connected) { toast('Already connected! 🦙🦙', '#7bdc6b'); return; }
    if (!this.el) this.build();
    this.el.hidden = false;
    this.say('Getting ready...');
    try {
      await this.startCamera();          // camera first: iPhone/iPad only share the real Wi-Fi address after camera permission
      this.showCode(await Net.prepare());
      this.say('Hold your screens facing each other! 📱↔️📱');
      this.scanLoop();
    } catch (e) {
      this.say('😕 ' + (e.message || 'Something went wrong. Close and try again!'));
    }
  },
  close() {
    this.stopCamera();
    if (this.el) this.el.hidden = true;
  },
  say(msg) { if (this.msg) this.msg.textContent = msg; },
  build() {
    const el = document.createElement('div');
    el.id = 'pair';
    el.innerHTML = `
      <div class="pair-box">
        <button class="pair-x" data-act="close" aria-label="Close">✖</button>
        <h2>🦙🦙 Play Together</h2>
        <p class="pair-msg"></p>
        <div class="pair-row">
          <div class="pair-cell"><canvas class="pair-qr" width="600" height="600"></canvas><span>My code</span></div>
          <div class="pair-cell"><video class="pair-cam" playsinline muted autoplay></video><span>My camera</span></div>
        </div>
        <p class="pair-tip">Both devices need the same Wi-Fi.</p>
        <details class="pair-manual">
          <summary>No camera? Copy and paste codes</summary>
          <textarea class="pair-code" rows="3"></textarea>
          <button data-act="paste">Use friend's code</button>
        </details>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.msg = el.querySelector('.pair-msg');
    this.qr = el.querySelector('.pair-qr');
    this.cam = el.querySelector('.pair-cam');
    this.codeBox = el.querySelector('.pair-code');
    el.addEventListener('click', e => {
      const act = e.target.dataset && e.target.dataset.act;
      if (act === 'close') this.close();
      if (act === 'paste') this.gotCode(this.codeBox.value);
    });
  },
  async gotCode(code) {
    if (this.busy) return;
    this.busy = true;
    try {
      const answer = await Net.handleCode(code);
      if (answer) { this.showCode(answer); Sfx.coin(); this.say('Got it! Keep holding still... ✨'); }
      else if (Net.role === 'host') this.say('Connecting... ✨');
    } catch (e) {
      this.say('😕 ' + (e.message || 'That code did not work.'));
    }
    this.busy = false;
  },
  showCode(code) {
    this.codeBox.value = code;
    const c = this.qr.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, 600, 600);
    if (!qrcode) { c.fillStyle = '#000'; c.font = '32px sans-serif'; c.fillText('QR maker missing:', 40, 280); c.fillText('use copy and paste', 40, 328); return; }
    const qr = qrcode(0, 'L');
    qr.addData(code);
    qr.make();
    const n = qr.getModuleCount(), cell = Math.floor(568 / n), off = Math.floor((600 - cell * n) / 2);  // big, crisp squares for the camera
    c.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) c.fillRect(off + col * cell, off + r * cell, cell, cell);
  },
  async startCamera() {
    if (this.stream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this.say('No camera here. Use copy and paste below.'); return; }
    try {
      // the front camera, so the two screens can face each other
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } } });
      this.cam.srcObject = this.stream;
      await this.cam.play().catch(() => {});
    } catch (e) {
      this.say('Camera is not allowed. Allow the camera, or use copy and paste below.');
    }
  },
  scanLoop() {
    if (!this.stream || !jsQR) return;
    const work = document.createElement('canvas'), wc = work.getContext('2d', { willReadFrequently: true });
    this.scanning = true;
    let lastData = '';
    const loop = () => {
      if (!this.scanning) return;
      if (this.cam.videoWidth && !this.busy) {
        const scale = Math.min(1, 800 / this.cam.videoWidth);
        work.width = Math.round(this.cam.videoWidth * scale); work.height = Math.round(this.cam.videoHeight * scale);
        wc.drawImage(this.cam, 0, 0, work.width, work.height);
        const img = wc.getImageData(0, 0, work.width, work.height);
        const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (hit && hit.data.startsWith('LRB') && hit.data !== lastData) { lastData = hit.data; this.gotCode(hit.data); }
      }
      setTimeout(loop, 120);
    };
    loop();
  },
  stopCamera() {
    this.scanning = false;
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.cam) this.cam.srcObject = null;
  },
};

export { Net, Pair, decodeCode, encodeCode, fromB64, pipeBytes, toB64, trimSdp };
