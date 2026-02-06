import streamDeck, {
  action,
  SingletonAction,
  Target,
  type DialAction,
  type DialDownEvent,
  type DialRotateEvent,
  type DialUpEvent,
  type KeyAction,
  type KeyDownEvent,
  type KeyUpEvent,
  type TouchTapEvent,
  type WillAppearEvent,
  type WillDisappearEvent
} from "@elgato/streamdeck";

type VisualState = "idle" | "down" | "hold" | "up";
type DialInputType = "idle" | "press" | "release" | "rotate" | "tap" | "hold";

type KeyState = {
  down: number;
  up: number;
  holdStartedAt: number | null;
  holdTimerRef: ReturnType<typeof setInterval> | null;
  lastHoldDuration: number | null;
  upFlashTimer: ReturnType<typeof setTimeout> | null;
};

type DialState = {
  presses: number;
  rotates: number;
  touches: number;
  netTicks: number;
  lastTicks: number;
  dotX: number;
  dotY: number;
  hasDot: boolean;
  segmentOffsetX: number;
  lastRenderAt: number;
  pendingLabel: string | null;
  renderTimer: ReturnType<typeof setTimeout> | null;
  lastInputType: DialInputType;
  lastRotateDirection: number;
};

const log = streamDeck.logger.createScope("TestMe");
const DIAL_LAYOUT = "layouts/dial-layout.json";
const FONT = "Segoe UI, Arial, sans-serif";
const MONO_FONT = "Consolas, Segoe UI Mono, monospace";

// ── Key dimensions ──
const KEY_SIZE = 72;
const KEY_RADIUS = 10;
const KEY_CHECKER_SIZE = 6;
const KEY_CHECKER_OPACITY = 0.03;
const KEY_LABEL_FONT_SIZE = 16;
const KEY_COUNTER_FONT_SIZE = 11;
const KEY_HOLD_TIMER_FONT_SIZE = 20;
const KEY_LABEL_Y = 28;
const KEY_HOLD_TIMER_Y = 48;
const KEY_HOLD_SUBTITLE_Y = 44;
const KEY_COUNTER_Y = 66;

// ── Dial dimensions ──
const TOUCH_CANVAS_WIDTH = 200;
const TOUCH_CANVAS_HEIGHT = 100;
const DIAL_CHECKER_SIZE = 12;
const DIAL_CHECKER_OPACITY = 0.03;
const DIAL_RENDER_INTERVAL_MS = 16;
const DIAL_LABEL_SIZE = 20;
const DIAL_LABEL_X = 10;
const DIAL_LABEL_Y = 24;
const DIAL_COUNTER_SIZE = 14;
const DIAL_COUNTER_Y = 88;
const DIAL_ACCENT_BAR_W = 4;

// ── Touch dot ──
const TOUCH_DOT_RADIUS = 8;
const TOUCH_DOT_GLOW_RADIUS = 11;

// ── Timing ──
const KEY_HOLD_THRESHOLD_MS = 500;
const KEY_HOLD_TIMER_INTERVAL_MS = 100;
const KEY_UP_FLASH_MS = 2000;

// ── Colors: idle ──
const COLOR_IDLE_BG = "#111111";
const COLOR_IDLE_TEXT = "#808080";
const COLOR_IDLE_COUNTER = "#555555";

// ── Colors: key states ──
const COLOR_DOWN_BG = "#1A3A5C";
const COLOR_DOWN_TEXT = "#66BBFF";
const COLOR_DOWN_RING = "#3399FF";

const COLOR_UP_BG = "#1A2E1A";
const COLOR_UP_TEXT = "#66DD88";
const COLOR_UP_RING = "#44AA66";

const COLOR_HOLD_BG = "#2A2200";
const COLOR_HOLD_TEXT = "#FFCC33";
const COLOR_HOLD_RING = "#FFAA00";

// ── Colors: dial input types ──
const COLOR_PRESS_ACCENT = "#66BBFF";
const COLOR_ROTATE_ACCENT = "#DDAA44";
const COLOR_TAP_ACCENT = "#66DD88";
const COLOR_HOLD_TAP_ACCENT = "#FF8844";

const KEY_COLORS: Record<VisualState, { bg: string; text: string; ring: string | null; ringWidth: number }> = {
  idle:  { bg: COLOR_IDLE_BG,  text: COLOR_IDLE_TEXT,  ring: null,            ringWidth: 0 },
  down:  { bg: COLOR_DOWN_BG,  text: COLOR_DOWN_TEXT,  ring: COLOR_DOWN_RING, ringWidth: 2 },
  hold:  { bg: COLOR_HOLD_BG,  text: COLOR_HOLD_TEXT,  ring: COLOR_HOLD_RING, ringWidth: 2 },
  up:    { bg: COLOR_UP_BG,    text: COLOR_UP_TEXT,    ring: COLOR_UP_RING,   ringWidth: 1 }
};

const DIAL_ACCENT_COLORS: Record<DialInputType, string> = {
  idle:    COLOR_IDLE_TEXT,
  press:   COLOR_PRESS_ACCENT,
  release: COLOR_PRESS_ACCENT,
  rotate:  COLOR_ROTATE_ACCENT,
  tap:     COLOR_TAP_ACCENT,
  hold:    COLOR_HOLD_TAP_ACCENT
};

// ── Utility functions ──

function formatSigned(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  return value > 0 ? `+${value}` : `${value}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── SVG builders ──

function buildKeySvg(opts: {
  label: string;
  counters: { down: number; up: number };
  state: VisualState;
  holdSeconds: number | null;
  lastHoldSeconds: number | null;
}): string {
  const { label, counters, state, holdSeconds, lastHoldSeconds } = opts;
  const colors = KEY_COLORS[state];
  const safeLabel = escapeSvg(label);

  const useChecker = state === "idle";
  let bgMarkup: string;
  if (useChecker) {
    bgMarkup = `
      <defs>
        <pattern id="kc" width="${KEY_CHECKER_SIZE}" height="${KEY_CHECKER_SIZE}" patternUnits="userSpaceOnUse">
          <rect width="${KEY_CHECKER_SIZE}" height="${KEY_CHECKER_SIZE}" fill="${COLOR_IDLE_BG}"/>
          <rect width="${KEY_CHECKER_SIZE / 2}" height="${KEY_CHECKER_SIZE / 2}" fill="#FFFFFF" opacity="${KEY_CHECKER_OPACITY}"/>
          <rect x="${KEY_CHECKER_SIZE / 2}" y="${KEY_CHECKER_SIZE / 2}" width="${KEY_CHECKER_SIZE / 2}" height="${KEY_CHECKER_SIZE / 2}" fill="#FFFFFF" opacity="${KEY_CHECKER_OPACITY}"/>
        </pattern>
      </defs>
      <rect width="${KEY_SIZE}" height="${KEY_SIZE}" rx="${KEY_RADIUS}" fill="url(#kc)"/>`;
  } else {
    bgMarkup = `<rect width="${KEY_SIZE}" height="${KEY_SIZE}" rx="${KEY_RADIUS}" fill="${colors.bg}"/>`;
  }

  const ringMarkup = colors.ring
    ? `<rect x="1" y="1" width="${KEY_SIZE - 2}" height="${KEY_SIZE - 2}" rx="${KEY_RADIUS}" fill="none" stroke="${colors.ring}" stroke-width="${colors.ringWidth}"/>`
    : "";

  let centerContent = "";
  if (state === "hold" && holdSeconds !== null) {
    centerContent = `<text x="36" y="${KEY_HOLD_TIMER_Y}" text-anchor="middle" font-family="${FONT}" font-size="${KEY_HOLD_TIMER_FONT_SIZE}" font-weight="700" fill="${colors.text}">${holdSeconds.toFixed(1)}s</text>`;
  } else if (state === "up" && lastHoldSeconds !== null) {
    centerContent = `<text x="36" y="${KEY_HOLD_SUBTITLE_Y}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="600" fill="${COLOR_UP_RING}">held ${lastHoldSeconds.toFixed(1)}s</text>`;
  }

  const counterColor = state === "idle" ? COLOR_IDLE_COUNTER : colors.text;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${KEY_SIZE}" height="${KEY_SIZE}" viewBox="0 0 ${KEY_SIZE} ${KEY_SIZE}">
      ${bgMarkup}
      ${ringMarkup}
      <text x="36" y="${KEY_LABEL_Y}" text-anchor="middle" font-family="${FONT}" font-size="${KEY_LABEL_FONT_SIZE}" font-weight="700" fill="${colors.text}">${safeLabel}</text>
      ${centerContent}
      <text x="6" y="${KEY_COUNTER_Y}" font-family="${MONO_FONT}" font-size="${KEY_COUNTER_FONT_SIZE}" font-weight="600" fill="${counterColor}">D:${counters.down}</text>
      <text x="66" y="${KEY_COUNTER_Y}" text-anchor="end" font-family="${MONO_FONT}" font-size="${KEY_COUNTER_FONT_SIZE}" font-weight="600" fill="${counterColor}">U:${counters.up}</text>
    </svg>
  `.trim();
}

function buildDialSvg(opts: {
  label: string;
  counters: { presses: number; rotates: number; touches: number };
  dot: { x: number; y: number; isHold: boolean } | null;
  patternOffsetX: number;
  inputType: DialInputType;
}): string {
  const { label, counters, dot, patternOffsetX, inputType } = opts;
  const safeLabel = escapeSvg(label);
  const accentColor = DIAL_ACCENT_COLORS[inputType];

  const accentBar = inputType !== "idle"
    ? `<rect x="0" y="0" width="${DIAL_ACCENT_BAR_W}" height="${TOUCH_CANVAS_HEIGHT}" fill="${accentColor}" opacity="0.8"/>`
    : "";

  let dotMarkup = "";
  if (dot) {
    const dotColor = dot.isHold ? COLOR_HOLD_TAP_ACCENT : COLOR_TAP_ACCENT;
    dotMarkup = `
      <circle cx="${dot.x}" cy="${dot.y}" r="${TOUCH_DOT_GLOW_RADIUS}" fill="none" stroke="${dotColor}" stroke-width="1" opacity="0.4"/>
      <circle cx="${dot.x}" cy="${dot.y}" r="${TOUCH_DOT_RADIUS}" fill="${dotColor}"/>`;
  }

  const counterBgOpacity = 0.4;
  const colW = Math.floor(TOUCH_CANVAS_WIDTH / 3);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${TOUCH_CANVAS_WIDTH}" height="${TOUCH_CANVAS_HEIGHT}" viewBox="0 0 ${TOUCH_CANVAS_WIDTH} ${TOUCH_CANVAS_HEIGHT}">
      <defs>
        <pattern id="checker" width="${DIAL_CHECKER_SIZE}" height="${DIAL_CHECKER_SIZE}" patternUnits="userSpaceOnUse" patternTransform="translate(-${patternOffsetX} 0)">
          <rect width="${DIAL_CHECKER_SIZE}" height="${DIAL_CHECKER_SIZE}" fill="${COLOR_IDLE_BG}"/>
          <rect width="${DIAL_CHECKER_SIZE / 2}" height="${DIAL_CHECKER_SIZE / 2}" fill="#FFFFFF" opacity="${DIAL_CHECKER_OPACITY}"/>
          <rect x="${DIAL_CHECKER_SIZE / 2}" y="${DIAL_CHECKER_SIZE / 2}" width="${DIAL_CHECKER_SIZE / 2}" height="${DIAL_CHECKER_SIZE / 2}" fill="#FFFFFF" opacity="${DIAL_CHECKER_OPACITY}"/>
        </pattern>
      </defs>
      <rect width="${TOUCH_CANVAS_WIDTH}" height="${TOUCH_CANVAS_HEIGHT}" fill="url(#checker)"/>
      ${accentBar}
      <text x="${DIAL_LABEL_X}" y="${DIAL_LABEL_Y}" font-family="${FONT}" font-size="${DIAL_LABEL_SIZE}" font-weight="700" fill="${accentColor}">${safeLabel}</text>
      ${dotMarkup}
      <rect x="0" y="70" width="${colW}" height="30" fill="#1A3A5C" opacity="${counterBgOpacity}"/>
      <rect x="${colW}" y="70" width="${colW}" height="30" fill="#2A2200" opacity="${counterBgOpacity}"/>
      <rect x="${colW * 2}" y="70" width="${TOUCH_CANVAS_WIDTH - colW * 2}" height="30" fill="#1A2E1A" opacity="${counterBgOpacity}"/>
      <text x="${Math.floor(colW / 2)}" y="${DIAL_COUNTER_Y}" text-anchor="middle" font-family="${MONO_FONT}" font-size="${DIAL_COUNTER_SIZE}" font-weight="600" fill="${COLOR_PRESS_ACCENT}">P:${counters.presses}</text>
      <text x="${colW + Math.floor(colW / 2)}" y="${DIAL_COUNTER_Y}" text-anchor="middle" font-family="${MONO_FONT}" font-size="${DIAL_COUNTER_SIZE}" font-weight="600" fill="${COLOR_ROTATE_ACCENT}">R:${counters.rotates}</text>
      <text x="${colW * 2 + Math.floor((TOUCH_CANVAS_WIDTH - colW * 2) / 2)}" y="${DIAL_COUNTER_Y}" text-anchor="middle" font-family="${MONO_FONT}" font-size="${DIAL_COUNTER_SIZE}" font-weight="600" fill="${COLOR_TAP_ACCENT}">T:${counters.touches}</text>
    </svg>
  `.trim();
}

// ── Action class ──

@action({ UUID: "com.crest.testme.key" })
class InputTesterAction extends SingletonAction {
  private readonly keyStates = new WeakMap<object, KeyState>();
  private readonly dialStates = new WeakMap<object, DialState>();
  private readonly keyTimers = new Map<string, { hold: ReturnType<typeof setInterval> | null; flash: ReturnType<typeof setTimeout> | null }>();

  private getKeyState(action: KeyAction): KeyState {
    const existing = this.keyStates.get(action);
    if (existing) return existing;
    const state: KeyState = {
      down: 0,
      up: 0,
      holdStartedAt: null,
      holdTimerRef: null,
      lastHoldDuration: null,
      upFlashTimer: null
    };
    this.keyStates.set(action, state);
    return state;
  }

  private getDialState(action: DialAction): DialState {
    const existing = this.dialStates.get(action);
    if (existing) return existing;
    const state: DialState = {
      presses: 0,
      rotates: 0,
      touches: 0,
      netTicks: 0,
      lastTicks: 0,
      dotX: 0,
      dotY: 0,
      hasDot: false,
      segmentOffsetX: 0,
      lastRenderAt: 0,
      pendingLabel: null,
      renderTimer: null,
      lastInputType: "idle",
      lastRotateDirection: 0
    };
    this.dialStates.set(action, state);
    return state;
  }

  private clearKeyTimers(actionId: string, state: KeyState): void {
    if (state.holdTimerRef) { clearInterval(state.holdTimerRef); state.holdTimerRef = null; }
    if (state.upFlashTimer) { clearTimeout(state.upFlashTimer); state.upFlashTimer = null; }
    const tracked = this.keyTimers.get(actionId);
    if (tracked) {
      if (tracked.hold) clearInterval(tracked.hold);
      if (tracked.flash) clearTimeout(tracked.flash);
      this.keyTimers.delete(actionId);
    }
  }

  private renderKey(action: KeyAction, visualState: VisualState, state: KeyState): void {
    const label = visualState === "idle" ? "READY"
      : visualState === "down" ? "DOWN"
      : visualState === "hold" ? "HOLD"
      : "UP";

    let holdSeconds: number | null = null;
    if (visualState === "hold") {
      if (state.holdStartedAt) {
        holdSeconds = (Date.now() - state.holdStartedAt) / 1000;
      } else if (state.lastHoldDuration !== null) {
        holdSeconds = state.lastHoldDuration / 1000;
      }
    }

    const lastHoldSeconds = visualState === "up" && state.lastHoldDuration !== null && state.lastHoldDuration >= KEY_HOLD_THRESHOLD_MS
      ? state.lastHoldDuration / 1000
      : null;

    const image = svgToDataUri(buildKeySvg({
      label,
      counters: { down: state.down, up: state.up },
      state: visualState,
      holdSeconds,
      lastHoldSeconds
    }));
    void action.setImage(image, { target: Target.HardwareAndSoftware });
    void action.setTitle("", { target: Target.HardwareAndSoftware });
  }

  private renderDialNow(action: DialAction, label: string, state: DialState): void {
    const dot = state.hasDot
      ? { x: state.dotX, y: state.dotY, isHold: state.lastInputType === "hold" }
      : null;
    const dialSvg = buildDialSvg({
      label,
      counters: { presses: state.presses, rotates: state.rotates, touches: state.touches },
      dot,
      patternOffsetX: state.segmentOffsetX,
      inputType: state.lastInputType
    });
    void action.setFeedback({
      canvas: { value: svgToDataUri(dialSvg) } as unknown as Record<string, unknown>
    });
    state.lastRenderAt = Date.now();
  }

  private renderDial(action: DialAction, label: string, state: DialState): void {
    const now = Date.now();
    const elapsed = now - state.lastRenderAt;
    if (elapsed >= DIAL_RENDER_INTERVAL_MS && !state.renderTimer) {
      this.renderDialNow(action, label, state);
      return;
    }

    state.pendingLabel = label;
    if (state.renderTimer) return;
    const delay = Math.max(0, DIAL_RENDER_INTERVAL_MS - elapsed);
    state.renderTimer = setTimeout(() => {
      state.renderTimer = null;
      const nextLabel = state.pendingLabel ?? label;
      state.pendingLabel = null;
      this.renderDialNow(action, nextLabel, state);
    }, delay);
  }

  // ── Event handlers ──

  override onWillAppear(ev: WillAppearEvent): void {
    if (ev.action.isKey()) {
      const state = this.getKeyState(ev.action);
      this.renderKey(ev.action, "idle", state);
      return;
    }
    if (ev.action.isDial()) {
      const state = this.getDialState(ev.action);
      void ev.action.setFeedbackLayout(DIAL_LAYOUT);
      const column = ev.action.coordinates?.column ?? 0;
      state.segmentOffsetX = column * TOUCH_CANVAS_WIDTH;
      state.hasDot = false;
      state.lastInputType = "idle";
      void ev.action.setTriggerDescription({
        rotate: "Turn",
        push: "Press",
        touch: "Tap / Hold"
      });
      this.renderDial(ev.action, "READY", state);
    }
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    const id = ev.action.id;
    const tracked = this.keyTimers.get(id);
    if (tracked) {
      if (tracked.hold) clearInterval(tracked.hold);
      if (tracked.flash) clearTimeout(tracked.flash);
      this.keyTimers.delete(id);
    }
    const dialState = this.dialStates.get(ev.action);
    if (dialState?.renderTimer) {
      clearTimeout(dialState.renderTimer);
      dialState.renderTimer = null;
    }
    log.info("willDisappear", { id });
  }

  override onKeyDown(ev: KeyDownEvent): void {
    if (!ev.action.isKey()) return;
    const state = this.getKeyState(ev.action);

    this.clearKeyTimers(ev.action.id, state);

    state.down += 1;
    state.holdStartedAt = Date.now();
    state.lastHoldDuration = null;
    log.info("keyDown", { id: ev.action.id, down: state.down });

    this.renderKey(ev.action, "down", state);

    const holdInterval = setInterval(() => {
      if (!state.holdStartedAt) return;
      const elapsed = Date.now() - state.holdStartedAt;
      if (elapsed >= KEY_HOLD_THRESHOLD_MS) {
        this.renderKey(ev.action, "hold", state);
      }
    }, KEY_HOLD_TIMER_INTERVAL_MS);

    state.holdTimerRef = holdInterval;
    this.keyTimers.set(ev.action.id, { hold: holdInterval, flash: null });
  }

  override onKeyUp(ev: KeyUpEvent): void {
    if (!ev.action.isKey()) return;
    const state = this.getKeyState(ev.action);

    const holdDuration = state.holdStartedAt ? Date.now() - state.holdStartedAt : 0;
    state.lastHoldDuration = holdDuration;
    state.holdStartedAt = null;

    if (state.holdTimerRef) { clearInterval(state.holdTimerRef); state.holdTimerRef = null; }
    const tracked = this.keyTimers.get(ev.action.id);
    if (tracked) { if (tracked.hold) clearInterval(tracked.hold); tracked.hold = null; }

    state.up += 1;
    log.info("keyUp", { id: ev.action.id, up: state.up, held: holdDuration });

    if (holdDuration >= KEY_HOLD_THRESHOLD_MS) {
      this.renderKey(ev.action, "hold", state);
      this.keyTimers.delete(ev.action.id);
    } else {
      this.renderKey(ev.action, "up", state);

      if (state.upFlashTimer) clearTimeout(state.upFlashTimer);
      const flashTimer = setTimeout(() => {
        state.upFlashTimer = null;
        this.renderKey(ev.action, "idle", state);
        this.keyTimers.delete(ev.action.id);
      }, KEY_UP_FLASH_MS);
      state.upFlashTimer = flashTimer;
      if (tracked) tracked.flash = flashTimer;
      else this.keyTimers.set(ev.action.id, { hold: null, flash: flashTimer });
    }
  }

  override onDialDown(ev: DialDownEvent): void {
    if (!ev.action.isDial()) return;
    const state = this.getDialState(ev.action);
    state.presses += 1;
    state.lastInputType = "press";
    log.info("dialDown", { id: ev.action.id, presses: state.presses });
    this.renderDial(ev.action, "PRESS", state);
  }

  override onDialUp(ev: DialUpEvent): void {
    if (!ev.action.isDial()) return;
    const state = this.getDialState(ev.action);
    state.lastInputType = "release";
    log.info("dialUp", { id: ev.action.id });
    this.renderDial(ev.action, "RELEASE", state);
  }

  override onDialRotate(ev: DialRotateEvent): void {
    if (!ev.action.isDial()) return;
    const state = this.getDialState(ev.action);
    state.rotates += Math.abs(ev.payload.ticks);
    state.netTicks += ev.payload.ticks;
    state.lastTicks = ev.payload.ticks;
    state.lastRotateDirection = Math.sign(ev.payload.ticks);
    state.lastInputType = "rotate";
    log.info("dialRotate", { id: ev.action.id, ticks: ev.payload.ticks, pressed: ev.payload.pressed });
    this.renderDial(ev.action, `ROT ${formatSigned(state.netTicks)}`, state);
  }

  override onTouchTap(ev: TouchTapEvent): void {
    if (!ev.action.isDial()) return;
    const state = this.getDialState(ev.action);

    state.touches += 1;
    const rawX = ev.payload.tapPos[0];
    const rawY = ev.payload.tapPos[1];
    const x = Math.round(rawX);
    const y = Math.round(rawY);
    const normX = rawX <= 1 ? rawX * TOUCH_CANVAS_WIDTH : rawX;
    const normY = rawY <= 1 ? rawY * TOUCH_CANVAS_HEIGHT : rawY;
    const left = clamp(normX - TOUCH_DOT_RADIUS, 0, TOUCH_CANVAS_WIDTH - TOUCH_DOT_RADIUS * 2);
    const top = clamp(normY - TOUCH_DOT_RADIUS, 0, TOUCH_CANVAS_HEIGHT - TOUCH_DOT_RADIUS * 2);
    state.dotX = left + TOUCH_DOT_RADIUS;
    state.dotY = top + TOUCH_DOT_RADIUS;
    state.hasDot = true;
    const label = ev.payload.hold ? "HOLD" : "TAP";
    state.lastInputType = ev.payload.hold ? "hold" : "tap";
    log.info("touchTap", { id: ev.action.id, hold: ev.payload.hold, tapPos: ev.payload.tapPos });
    this.renderDial(ev.action, `${label} ${x},${y}`, state);
  }
}

streamDeck.actions.registerAction(new InputTesterAction());
streamDeck.connect();
