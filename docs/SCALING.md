# Scaling & load — ไพ่สลาฟ

_How the single-instance server works today, where it breaks, and the ordered path to horizontal scale._
_เซิร์ฟเวอร์อินสแตนซ์เดียวทำงานยังไง จุดที่มันตัน และเส้นทางสเกลออกแนวนอนแบบเรียงตามความคุ้ม_

This is a solo-built, single-process, in-memory app. That is a deliberate, appropriate choice for the
current traffic — not an accident to apologize for. This document describes it accurately, states the
hard limits honestly, and lays out what would change to run more than one instance.

---

## 1. Current architecture (and why it's fine today)

One Node process, one Render web service, everything in RAM.

- **Room state lives in a `Map<string, Room>`** in `server/index.ts` (`const rooms = new Map()`).
  Each `Room` (`server/room.ts`) holds the whole game: players, hands, pile, turn index, rotation
  direction, finish order, per-round history, session stats, and settings. The server is fully
  **authoritative** — clients only send intents (`create`/`join`/`play`/`pass`/`give`/...), the
  server validates every one (valibot schemas + in-`Room` rule checks) and broadcasts a per-viewer
  `state` snapshot. No trust in the client.

- **Socket.IO with the default in-memory adapter.** A socket that belongs to room `ABCD` is joined to
  the Socket.IO room `ABCD` (`socket.join(code)`), and `broadcast(room)` walks `room.players` /
  `room.spectators` and emits `state` to each socket id **on this process**. There is no cross-process
  fan-out because there is only one process.

- **Debounced file persistence.** `scheduleSave()` debounces writes 400 ms and `saveRooms()` serializes
  every room via `Room.toState()` to `rooms.json` (path overridable with `ROOMS_FILE`). On boot,
  `loadRooms()` rehydrates rooms via `Room.fromState()` so an in-progress game survives a restart /
  redeploy. On load, everyone is marked offline and a **10-minute cleanup timer** deletes the room if
  nobody reconnects. This is what makes "refresh mid-game, reclaim your seat" work — it is a
  **single-instance** mechanism (one process owns the file).

- **Per-room timers run in-process.** Three families of `setTimeout`, all keyed off the room and
  re-armed inside `broadcast(room)`:
  - `armTurnTimer(room)` — the per-turn countdown. Re-arms only when the turn actually changes
    (signature `` `${room.turn}:${room.pileOwner}` ``), so a reconnect doesn't reset the clock. On
    expiry `onTurnTimeout` calls `room.autoAct()` (auto-pass, or auto-play the lowest card when
    leading), then re-broadcasts.
  - `scheduleBot(room)` — when it's a bot's turn (or a bot owes cards in the exchange phase), fire
    `room.botAct()` / `room.botGive()` after a small randomized delay so it feels natural. Skipped
    entirely when no human is online (`humansOnline`).
  - `scheduleStuckPass(room)` — if it's a human's turn, there's a pile, and `anyLegalMove()` says they
    literally cannot beat it, auto-pass after `STUCK_MS` so the game doesn't wait on a forced move.

- **Grace-period cleanup.** On `disconnect`/`leave`, if the room has no humans left, a cleanup timer is
  armed — **60 s** in the lobby, **5 min** mid-game/exchange/round-end (a backgrounded mobile PWA is
  commonly suspended for >60 s; too short and the room is reaped before the player can return).

- **Observability snapshot.** `GET /healthz` returns `{ ok, uptimeSec }`. `GET /metrics` returns
  `snapshot(rooms)` (`server/observability.ts`): live `rooms`, `roomsPlaying`, `players`, `bots`,
  `spectators` plus cumulative counters (`roomsCreated`, `gamesStarted`, `connections`, `rateLimited`,
  `peakConcurrent`). Optionally gated by `METRICS_TOKEN`.

Why this is fine today: the workload is a handful of concurrent 2–6 player rooms. Each action touches
one room's state (cheap), and fan-out is to at most 6 players + a few spectators. One event loop keeps
up with room, comfortably, and the file snapshot is a pragmatic durability story for a free-tier
single web service. **Distributed systems have real costs** (a second moving part to run, network
partitions, split-brain timers) — paying them before there is load would be the actual mistake.

---

## 2. Hard limits (where the single instance tops out)

These are structural, not tuning knobs:

1. **One event loop.** All rule evaluation, serialization, JSON `state` construction, and Socket.IO
   encoding happen on a single CPU. Throughput for the whole service is bounded by that one core.
2. **Broadcast is O(N) per action, on that core.** Every `play`/`pass` rebuilds and emits a `state`
   per viewer in the room. Fine at 6/room; it's still one thread doing all rooms' fan-out.
3. **File persistence is single-instance only.** `rooms.json` is a local file. Two instances writing
   the same file would clobber each other; two instances with separate files would each hold half the
   world with no way to route between them.
4. **No cross-instance room routing.** The `Map` is in this process's heap. Another instance has no
   idea room `ABCD` exists, cannot read its state, and cannot serve a player who lands on it.
5. **Sockets are sticky to the process that holds the room.** Because state and the Socket.IO room
   both live in one process, a player's socket **must** stay on that process for the whole game. There
   is no shared adapter to relay a broadcast to a socket connected elsewhere.
6. **In-RAM state dies with the process** apart from the debounced file snapshot — and that snapshot
   is only reloadable by an instance that can read that same file.

---

## 3. The path to horizontal scale (in order of effort)

Do these in order. Each step is only worth doing once the one before it is in place.

### 3.1 Externalize room state (Redis or Postgres)

Replace the `Map` + `rooms.json` with a shared store so **any** instance can serve **any** room.

- Redis (hash/JSON per room, keyed by code) fits the access pattern: read-modify-write one room per
  action, plus TTL for the grace-period cleanup. Postgres works too if you want durability/querying.
- `Room.toState()` / `Room.fromState()` already define a clean serialize/deserialize boundary — the
  store swap is "load room → mutate → save room" around the existing methods.
- **Concurrency:** two actions on the same room must not interleave. Use a per-room lock (Redis
  `SET NX` lease, or a Lua/`WATCH` transaction, or route all of a room's traffic to one owner — see
  3.4). This is the real work of this step.

### 3.2 Add the Socket.IO Redis adapter

Install `@socket.io/redis-adapter` and wire it into the `Server`. Now `io.to(code).emit('state', …)`
reaches sockets for that room **on every instance**, not just the local one. Without this, a broadcast
on instance A never reaches a player whose socket landed on instance B.

- With a shared adapter you can also switch the code to `io.to(code).emit(...)` for the shared
  fields and only compute per-viewer hands where needed, instead of the current per-socket-id loop.

### 3.3 Sticky sessions at the load balancer

A single Socket.IO connection that starts on HTTP long-polling and upgrades to WebSocket must hit the
**same** instance for both, or the upgrade fails. Two ways out:

- **Sticky sessions** at the LB (cookie/`sid`-based affinity), **or**
- **Force `transports: ['websocket']`** so there's no polling→ws handoff to keep pinned (the load
  test in `scripts/loadtest.mjs` does exactly this). Simplest if you don't need the polling fallback.
- **Render note:** Render's HTTP load balancer does not guarantee sticky sessions across instances, so
  the pragmatic combo on Render is _websocket-only transport_ **plus** the Redis adapter (3.2) — that
  way it doesn't matter which instance a socket lands on for broadcasts. Affinity of a socket to _one
  instance for the life of the TCP connection_ is inherent (the WS stays open to whatever it dialed);
  what you must not rely on is a _reconnect_ returning to the same instance — which 3.1 makes fine.

### 3.4 ⚠️ GOTCHA — the per-room timers must have a single owner

**Read this before turning on a second instance.** The turn/bot/stuck timers
(`armTurnTimer`, `scheduleBot`, `scheduleStuckPass`) currently run **in-process**, re-armed on every
`broadcast`. With N instances each holding a view of room `ABCD`, **each instance would fire its own
turn timer for the same room** → the turn is auto-passed N times, the bot plays N times, cards get
double-applied. This corrupts game state. It is the single most dangerous part of scaling this app.

The timers need **exactly one owner per room**. Options:

- **Owner instance per room.** Whichever instance "owns" room `ABCD` (e.g. holds its lease from 3.1) is
  the only one that arms and services its timers. On owner failover, the new owner re-arms from the
  persisted `turnDeadline`.
- **Externalize the timers.** Move the deadline into the store and drive expiry from a single
  scheduled worker / delayed queue (e.g. a Redis sorted-set of `deadline → roomCode`, or BullMQ
  delayed jobs). One consumer processes each due room exactly once.

Either way, the invariant is: **a given room's timer fires on one and only one instance.** Note the
timers are already gated by `humansOnline(room)` and re-armed idempotently by turn-signature, which
helps but does not by itself prevent N instances from each being an owner.

### 3.5 Observability for scale

The single-instance `/metrics` snapshot stops being the whole picture once there are N instances.

- Export the same numbers to a real backend (Prometheus/OpenTelemetry → Grafana): scrape each
  instance and **aggregate** rooms/sockets/players across the fleet, plus per-instance event-loop lag
  and CPU. `peakConcurrent` etc. become per-instance gauges you sum.
- Add per-room-owner metrics once 3.4 lands (which instance owns how many rooms; timer-fire counts) so
  you can catch a split-brain (two owners) immediately.
- Sentry is already wired (`server/observability.ts`) for error capture across instances.

---

## 4. When to bother

Rough capacity of the **current single free-tier instance**: comfortably dozens of concurrent rooms
(order of ~50–100 rooms × up to 6 = a few hundred sockets) before one event loop / the free plan's CPU
& memory become the constraint. Fan-out is tiny per action, so the ceiling is CPU on burst (many rooms
acting at once) and RAM for held state, not the protocol.

Invest in horizontal scale when you see, **sustained** (not a one-off spike):

- event-loop lag climbing / p95 action→broadcast latency degrading under load,
- CPU pinned near 100% on the single core with rooms still queuing, or
- concurrent rooms/sockets approaching the low hundreds and still growing.

The trigger to act is **sustained** pressure on those signals — measure with the load test below and
the `/metrics` snapshot before adding a second instance. Until then, one process is the right call.

---

## 5. Evidence: the load test

`scripts/loadtest.mjs` is a standalone Node ESM script (uses the already-installed `socket.io-client`).
It opens `ROOMS × PER` real WebSocket clients, drives them through `create`/`join`/`addBot`/`start`,
plays a bounded number of legal moves per client, and prints connect-time p50/p95, `state` msgs/sec,
error counts, and wall-clock — exiting non-zero if the error rate is high.

```bash
# against a locally running server (pnpm start), 20 rooms × 4 players:
ROOMS=20 PER=4 node scripts/loadtest.mjs http://localhost:3000

# a quick smoke run:
ROOMS=3 PER=3 node scripts/loadtest.mjs http://localhost:3000
```

Knobs (env or argv): `TARGET`/`argv[2]`, `ROOMS`, `PER`, `ACTIONS`, `DURATION_MS`, `ERROR_RATE_MAX`,
`CONNECT_TIMEOUT`. See the header comment in the script for details. It forces
`transports: ['websocket']` (per §3.3) and self-terminates on a hard timeout.
