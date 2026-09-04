// 오르답 일일 등수 API. 게임 자체는 Vercel 이 서빙하고, 여기는 판 하나만 맡는다.
import { submitScore, topRows } from './board.js';

const ALLOW = [
  'https://muhan-pi.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
];

function cors(origin) {
  const ok = ALLOW.includes(origin) || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin || '');
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOW[0],
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
  };
}
const json = (data, origin, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(origin) },
});

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (url.pathname !== '/api/rank') return json({ error: 'not found' }, origin, 404);

    if (request.method === 'GET') {
      const n = Math.min(50, Math.max(1, Number(url.searchParams.get('n')) || 10));
      return json(await topRows(env.RANK, n), origin);
    }
    if (request.method === 'POST') {
      let body = null;
      try { body = await request.json(); } catch { return json({ error: 'bad json' }, origin, 400); }
      const res = await submitScore(env.RANK, body);
      return json(res, origin, res.ok ? 200 : 400);
    }
    return json({ error: 'method' }, origin, 405);
  },
};
