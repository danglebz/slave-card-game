// progress.ts — top progress bar (shadcn), ref-counted so actions can stack
// singleton that the ProgressBar component subscribes to; width value 0..100, active = shown
type Listener = (state: { width: number; active: boolean }) => void;

let count = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let val = 0;
let active = false;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l({ width: val, active });
}

export function subscribeProgress(l: Listener): () => void {
  listeners.add(l);
  l({ width: val, active });
  return () => listeners.delete(l);
}

function begin() {
  val = 8;
  active = true;
  emit();
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    // gradually creep toward 92% then wait for done
    val += (92 - val) * 0.12;
    emit();
  }, 220);
}

function end() {
  if (timer) clearInterval(timer);
  timer = null;
  val = 100;
  emit();
  setTimeout(() => {
    active = false;
    emit();
    setTimeout(() => {
      val = 0;
      emit();
    }, 250);
  }, 180);
}

export function progStart() {
  if (++count === 1) begin();
}
export function progDone() {
  if (count > 0 && --count === 0) end();
}
