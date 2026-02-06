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
  type WillAppearEvent
} from "@elgato/streamdeck";

type KeyState = {
  down: number;
  up: number;
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
};

const log = streamDeck.logger.createScope("TestMe");
const DIAL_LAYOUT = "layouts/dial-layout.json";
const TOUCH_DOT_SIZE = 10;
const TOUCH_CANVAS_WIDTH = 200;
const TOUCH_CANVAS_HEIGHT = 100;
const DOT_COLOR = "#FFFFFF";
const DIAL_BG = "#090909";
const DIAL_TEXT = "#B0B0B0";
const DIAL_FONT = "Segoe UI, Arial, sans-serif";
const DIAL_LABEL_X = 12;
const DIAL_LABEL_Y = 26;
const DIAL_COUNTS_X = 12;
const DIAL_COUNTS_Y = 54;
const DIAL_LABEL_SIZE = 18;
const DIAL_COUNTS_SIZE = 16;
const DIAL_CHECKER_SIZE = 12;
const DIAL_CHECKER_OPACITY = 0.03;
const DIAL_RENDER_INTERVAL_MS = 16;
const KEY_SIZE = 72;
const KEY_RADIUS = 10;
const KEY_BG = "#0B0B0B";
const KEY_TEXT = "#B0B0B0";
const KEY_RING = "#FFFFFF";
const KEY_LABEL_X = 6;
const KEY_LABEL_Y = 14;
const KEY_COUNTS_X = 66;
const KEY_COUNTS_Y = 66;
const KEY_FONT_SIZE = 11;
const KEY_CHECKER_SIZE = 6;
const KEY_CHECKER_OPACITY = 0.05;

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

function buildDialSvg(
  label: string,
  counts: string,
  dot: { x: number; y: number } | null,
  patternOffsetX: number
): string {
  const safeLabel = escapeSvg(label);
  const safeCounts = escapeSvg(counts);
  const dotMarkup = dot
    ? `<circle cx="${dot.x}" cy="${dot.y}" r="${TOUCH_DOT_SIZE / 2}" fill="${DOT_COLOR}" />`
    : "";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${TOUCH_CANVAS_WIDTH}" height="${TOUCH_CANVAS_HEIGHT}" viewBox="0 0 ${TOUCH_CANVAS_WIDTH} ${TOUCH_CANVAS_HEIGHT}">
      <defs>
        <pattern id="checker" width="${DIAL_CHECKER_SIZE}" height="${DIAL_CHECKER_SIZE}" patternUnits="userSpaceOnUse" patternTransform="translate(-${patternOffsetX} 0)">
          <rect width="${DIAL_CHECKER_SIZE}" height="${DIAL_CHECKER_SIZE}" fill="${DIAL_BG}" />
          <rect width="${DIAL_CHECKER_SIZE / 2}" height="${DIAL_CHECKER_SIZE / 2}" fill="#FFFFFF" opacity="${DIAL_CHECKER_OPACITY}" />
          <rect x="${DIAL_CHECKER_SIZE / 2}" y="${DIAL_CHECKER_SIZE / 2}" width="${DIAL_CHECKER_SIZE / 2}" height="${DIAL_CHECKER_SIZE / 2}" fill="#FFFFFF" opacity="${DIAL_CHECKER_OPACITY}" />
        </pattern>
      </defs>
      <rect width="${TOUCH_CANVAS_WIDTH}" height="${TOUCH_CANVAS_HEIGHT}" fill="url(#checker)" />
      <text x="${DIAL_LABEL_X}" y="${DIAL_LABEL_Y}" font-family="${DIAL_FONT}" font-size="${DIAL_LABEL_SIZE}" font-weight="600" fill="${DIAL_TEXT}">${safeLabel}</text>
      <text x="${DIAL_COUNTS_X}" y="${DIAL_COUNTS_Y}" font-family="${DIAL_FONT}" font-size="${DIAL_COUNTS_SIZE}" font-weight="600" fill="${DIAL_TEXT}">${safeCounts}</text>
      ${dotMarkup}
    </svg>
  `.trim();
}

function buildKeySvg(label: string, counts: string, pressed: boolean): string {
  const safeLabel = escapeSvg(label);
  const safeCounts = escapeSvg(counts);
  const ring = pressed
    ? `<rect x="1" y="1" width="${KEY_SIZE - 2}" height="${KEY_SIZE - 2}" rx="${KEY_RADIUS}" fill="none" stroke="${KEY_RING}" stroke-width="2" />
       <rect x="3" y="3" width="${KEY_SIZE - 6}" height="${KEY_SIZE - 6}" rx="${KEY_RADIUS - 2}" fill="none" stroke="${KEY_RING}" stroke-width="1" opacity="0.35" />`
    : "";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${KEY_SIZE}" height="${KEY_SIZE}" viewBox="0 0 ${KEY_SIZE} ${KEY_SIZE}">
      <defs>
        <pattern id="key-checker" width="${KEY_CHECKER_SIZE}" height="${KEY_CHECKER_SIZE}" patternUnits="userSpaceOnUse">
          <rect width="${KEY_CHECKER_SIZE}" height="${KEY_CHECKER_SIZE}" fill="${KEY_BG}" />
          <rect width="${KEY_CHECKER_SIZE / 2}" height="${KEY_CHECKER_SIZE / 2}" fill="#FFFFFF" opacity="${KEY_CHECKER_OPACITY}" />
          <rect x="${KEY_CHECKER_SIZE / 2}" y="${KEY_CHECKER_SIZE / 2}" width="${KEY_CHECKER_SIZE / 2}" height="${KEY_CHECKER_SIZE / 2}" fill="#FFFFFF" opacity="${KEY_CHECKER_OPACITY}" />
        </pattern>
      </defs>
      <rect width="${KEY_SIZE}" height="${KEY_SIZE}" rx="${KEY_RADIUS}" fill="url(#key-checker)" />
      ${ring}
      <text x="${KEY_LABEL_X}" y="${KEY_LABEL_Y}" font-family="Segoe UI, Arial, sans-serif" font-size="${KEY_FONT_SIZE}" font-weight="600" fill="${KEY_TEXT}">${safeLabel}</text>
      <text x="${KEY_COUNTS_X}" y="${KEY_COUNTS_Y}" text-anchor="end" font-family="Segoe UI, Arial, sans-serif" font-size="${KEY_FONT_SIZE}" font-weight="600" fill="${KEY_TEXT}">${safeCounts}</text>
    </svg>
  `.trim();
}

@action({ UUID: "com.crest.testme.key" })
class InputTesterAction extends SingletonAction {
  private readonly keyStates = new WeakMap<object, KeyState>();
  private readonly dialStates = new WeakMap<object, DialState>();

  private getKeyState(action: KeyAction): KeyState {
    const existing = this.keyStates.get(action);
    if (existing) return existing;
    const state: KeyState = { down: 0, up: 0 };
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
      renderTimer: null
    };
    this.dialStates.set(action, state);
    return state;
  }

  private renderKey(action: KeyAction, label: string, state: KeyState, pressed: boolean): void {
    const counts = `D:${state.down} U:${state.up}`;
    const image = svgToDataUri(buildKeySvg(label, counts, pressed));
    void action.setImage(image, { target: Target.HardwareAndSoftware });
    void action.setTitle("", { target: Target.HardwareAndSoftware });
  }

  private renderDialNow(action: DialAction, label: string, state: DialState): void {
    const counts = `P:${state.presses} R:${state.rotates} T:${state.touches}`;
    const dot = state.hasDot ? { x: state.dotX, y: state.dotY } : null;
    const dialSvg = buildDialSvg(label, counts, dot, state.segmentOffsetX);
    const dialImage = svgToDataUri(dialSvg);
    void action.setFeedback({
      canvas: { value: dialImage } as unknown as Record<string, unknown>
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

  override onWillAppear(ev: WillAppearEvent): void {
    if (ev.action.isKey()) {
      const state = this.getKeyState(ev.action);
      this.renderKey(ev.action, "READY", state, false);
      return;
    }
    if (ev.action.isDial()) {
      const state = this.getDialState(ev.action);
      void ev.action.setFeedbackLayout(DIAL_LAYOUT);
      const column = ev.action.coordinates?.column ?? 0;
      state.segmentOffsetX = column * TOUCH_CANVAS_WIDTH;
      state.hasDot = false;
      this.renderDial(ev.action, "READY", state);
    }
  }

  override onDialDown(ev: DialDownEvent): void {
    if (!ev.action.isDial()) return;
    const state = this.getDialState(ev.action);
    state.presses += 1;
    log.info("dialDown", { id: ev.action.id, presses: state.presses });
    this.renderDial(ev.action, "PRESS", state);
  }

  override onDialUp(ev: DialUpEvent): void {
    if (!ev.action.isDial()) return;
    const state = this.getDialState(ev.action);
    log.info("dialUp", { id: ev.action.id });
    this.renderDial(ev.action, "RELEASE", state);
  }

  override onDialRotate(ev: DialRotateEvent): void {
    if (!ev.action.isDial()) return;
    const state = this.getDialState(ev.action);
    state.rotates += Math.abs(ev.payload.ticks);
    state.netTicks += ev.payload.ticks;
    state.lastTicks = ev.payload.ticks;
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
    const half = TOUCH_DOT_SIZE / 2;
    const normX = rawX <= 1 ? rawX * TOUCH_CANVAS_WIDTH : rawX;
    const normY = rawY <= 1 ? rawY * TOUCH_CANVAS_HEIGHT : rawY;
    const left = clamp(normX - half, 0, TOUCH_CANVAS_WIDTH - TOUCH_DOT_SIZE);
    const top = clamp(normY - half, 0, TOUCH_CANVAS_HEIGHT - TOUCH_DOT_SIZE);
    const label = ev.payload.hold ? "HOLD" : "TAP";
    log.info("touchTap", { id: ev.action.id, hold: ev.payload.hold, tapPos: ev.payload.tapPos });
    state.dotX = left + half;
    state.dotY = top + half;
    state.hasDot = true;
    this.renderDial(ev.action, `${label} ${x},${y}`, state);
  }

  override onKeyDown(ev: KeyDownEvent): void {
    if (!ev.action.isKey()) return;
    const state = this.getKeyState(ev.action);
    state.down += 1;
    log.info("keyDown", { id: ev.action.id, down: state.down });
    this.renderKey(ev.action, "DOWN", state, true);
  }

  override onKeyUp(ev: KeyUpEvent): void {
    if (!ev.action.isKey()) return;
    const state = this.getKeyState(ev.action);
    state.up += 1;
    log.info("keyUp", { id: ev.action.id, up: state.up });
    this.renderKey(ev.action, "UP", state, false);
  }
}

streamDeck.actions.registerAction(new InputTesterAction());
streamDeck.connect();
