// Vercel 서버리스 함수: POST /api/agent { message }
// Gemini 가 find_spots · get_weather 를 스스로 골라 호출하고, 결과를 바탕으로 추천 답변을 만든다.
// API Key 는 Vercel 환경변수(GEMINI_API_KEY)에서만 읽는다.
const { tools, handlers } = require('./tools');

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const MAX_TURNS = 6;

const SYSTEM =
  '당신은 제주 여행 추천 도우미다. 사용자의 말에서 지역과 상황을 파악하고, 필요한 도구를 직접 골라 호출한다. ' +
  '날씨가 중요한 질문이면 get_weather 를 먼저 보고, 비가 오거나 강수확률이 높으면 실내, 맑으면 야외 위주로 find_spots 를 호출한다. ' +
  '장소는 반드시 find_spots 결과에서만 추천하고, 목록에 없는 장소나 운영시간 · 요금은 지어내지 않는다. ' +
  '지역이 불분명하면 되묻지 말고 제주시로 가정하되 그렇게 가정했다고 알려 준다. ' +
  '답변은 한국어로 짧게: 날씨 요약 한 줄, 추천 장소 3~5곳(이유 한 줄씩).';

// tools.js 의 도구 설명(name · description · input_schema)을 Gemini 형식으로 바꾼다.
const functionDeclarations = tools.map(t => ({
  name: t.name,
  description: t.description,
  parameters: t.input_schema,
}));

async function callGemini(key, contents, withTools = true) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents,
      tools: withTools ? [{ functionDeclarations }] : undefined,
    }),
  };
  // 503(수요 폭주) · 429(요청 제한)는 일시적이라 짧게 쉬었다가 최대 3번까지 시도한다.
  let r;
  for (let attempt = 0; attempt < 3; attempt++) {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) }); // 20초 안에 안 오면 중단
    if (r.status !== 503 && r.status !== 429) break;
    await new Promise(ok => setTimeout(ok, 1000 * (attempt + 1)));
  }
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Gemini 요청 실패 (${r.status}) ${t.slice(0, 200)}`);
  }
  return r.json();
}

module.exports = async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });
  }
  // 임시 진단: GET /api/agent?mode=plain|tools → Gemini 응답 시간과 상태만 돌려준다(키는 노출하지 않음).
  if (req.method === 'GET') {
    const t = Date.now();
    if (req.query.mode === 'models') {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', { headers: { 'x-goog-api-key': key } });
      const d = await r.json();
      const names = (d.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', ''));
      return res.status(200).json({ status: r.status, names, error: d.error && d.error.message });
    }
    try {
      const d = await callGemini(key, [{ role: 'user', parts: [{ text: '동쪽 실내 장소 알려줘' }] }], req.query.mode === 'tools');
      const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
      return res.status(200).json({ model: MODEL, mode: req.query.mode || 'plain', ms: Date.now() - t, parts: JSON.stringify(parts).slice(0, 400) });
    } catch (e) {
      return res.status(200).json({ model: MODEL, mode: req.query.mode || 'plain', ms: Date.now() - t, error: String(e.message).slice(0, 300) });
    }
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 로 요청해 주세요.' });
  }
  const message = String((req.body && req.body.message) || '').trim().slice(0, 500);
  if (!message) {
    return res.status(400).json({ error: '질문을 입력해 주세요.' });
  }

  const contents = [{ role: 'user', parts: [{ text: message }] }];
  const steps = []; // 화면에 보여 줄 도구 호출 기록
  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const data = await callGemini(key, contents);
      const content = data.candidates && data.candidates[0] && data.candidates[0].content;
      const parts = (content && content.parts) || [];
      const calls = parts.filter(p => p.functionCall);
      if (calls.length === 0) {
        const answer = parts.map(p => p.text || '').join('').trim();
        return res.status(200).json({ answer: answer || '답변을 만들지 못했습니다. 질문을 바꿔 다시 시도해 주세요.', steps });
      }
      contents.push(content); // 모델의 도구 호출 요청을 그대로 이어 붙인다
      const responses = [];
      for (const { functionCall: c } of calls) {
        const fn = handlers[c.name];
        let out;
        try {
          out = fn ? await fn(c.args || {}) : { error: `알 수 없는 도구: ${c.name}` };
        } catch (e) {
          out = { error: '도구 실행 중 오류가 발생했습니다.' };
        }
        steps.push({ tool: c.name, input: c.args || {}, result: out });
        responses.push({ functionResponse: { name: c.name, response: { result: out } } });
      }
      contents.push({ role: 'user', parts: responses });
    }
    return res.status(200).json({ answer: '답변을 만들지 못했습니다. 질문을 바꿔 다시 시도해 주세요.', steps });
  } catch (e) {
    return res.status(500).json({ error: '서버 오류가 발생했습니다.', detail: String(e.message).slice(0, 200) });
  }
};
