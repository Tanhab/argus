import { createServer, type ServerResponse } from 'node:http';

// A controllable target for the Phase 4 flap benchmark and the Phase 5 EWMA bench. The
// /control/* endpoints mutate an in-memory mode; every other path is the "monitored"
// surface a checker would hit. There are no tests: this is a controllable side effect,
// not application code — if it misbehaves during a bench you see it immediately.

type Mode = 'ok' | 'fail' | 'slow';

let mode: Mode = 'ok';
let slowMs = 0;

function text(res: ServerResponse, body: string): void {
  res.setHeader('Content-Type', 'text/plain');
  res.end(body);
}

function json(res: ServerResponse, body: unknown): void {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = req.url ?? '/';

  // Control plane — flips the mode the monitored surface serves under.
  if (url === '/control/ok') {
    mode = 'ok';
    slowMs = 0;
    return text(res, 'mode=ok');
  }
  if (url === '/control/fail') {
    mode = 'fail';
    return text(res, 'mode=fail');
  }
  if (url.startsWith('/control/slow/')) {
    slowMs = Number.parseInt(url.split('/').pop() ?? '0', 10) || 0;
    mode = 'slow';
    return text(res, `mode=slow ${slowMs}ms`);
  }
  if (url === '/control/status') {
    return json(res, { mode, slowMs });
  }

  // Monitored surface — what a checker actually pings.
  if (mode === 'fail') {
    res.statusCode = 503;
    return text(res, 'down');
  }
  if (mode === 'slow') {
    await new Promise((resolve) => setTimeout(resolve, slowMs));
  }
  return text(res, 'ok');
});

const port = Number(process.env.PORT ?? 7070);
server.listen(port, () => {
  console.log(`fake-target listening on :${port} (mode=${mode})`);
});
