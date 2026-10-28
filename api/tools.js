// 에이전트 도구 2개: find_spots(관광지 목록 검색), get_weather(Open-Meteo 날씨, 키 불필요)
const { spots } = require('../index.json');

const MAX_RESULTS = 8;
const AREAS = ['동쪽', '서쪽', '서귀포', '제주시'];

// 목록에 장소별 좌표가 없어서 지역 중심점만 쓴다(근사값).
const CENTER = {
  동쪽: [33.46, 126.88],
  서쪽: [33.36, 126.3],
  서귀포: [33.25, 126.56],
  제주시: [33.51, 126.52],
};

// 목록의 area 는 '동쪽(성산)' · '서쪽(안덕)' 처럼 읍면이 붙어 있으므로 앞부분으로 맞춘다.
const inArea = (spotArea, area) => spotArea === area || spotArea.startsWith(area + '(');

function find_spots({ area, indoor } = {}) {
  if (!AREAS.includes(area)) {
    return { error: `area 는 ${AREAS.join(' · ')} 중 하나여야 합니다.` };
  }
  const picked = spots
    .filter(s => inArea(s.area, area))
    .filter(s => indoor === undefined || indoor === null || s.indoor === indoor)
    .slice(0, MAX_RESULTS)
    .map(s => ({
      name: s.name,
      area: s.area,
      indoor: s.indoor,
      desc: s.desc || s.type, // 목록에는 설명 대신 유형(type)이 들어 있다
    }));
  return { count: picked.length, spots: picked };
}

// WMO 날씨 코드 → 한글
function weatherText(code) {
  if (code === 0) return '맑음';
  if (code <= 3) return '구름 조금~흐림';
  if (code <= 48) return '안개';
  if (code <= 57) return '이슬비';
  if (code <= 67) return '비';
  if (code <= 77) return '눈';
  if (code <= 82) return '소나기';
  if (code <= 86) return '눈 소나기';
  return '뇌우';
}

async function get_weather({ area } = {}) {
  if (!AREAS.includes(area)) {
    return { error: `area 는 ${AREAS.join(' · ')} 중 하나여야 합니다.` };
  }
  const [lat, lon] = CENTER[area];
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,precipitation,weather_code,wind_speed_10m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + '&timezone=Asia%2FSeoul&forecast_days=3';
  const r = await fetch(url);
  if (!r.ok) return { error: `날씨 요청 실패 (${r.status})` };
  const d = await r.json();
  return {
    area,
    now: {
      weather: weatherText(d.current.weather_code),
      temp_c: d.current.temperature_2m,
      precipitation_mm: d.current.precipitation,
      wind_kmh: d.current.wind_speed_10m,
    },
    daily: d.daily.time.map((date, i) => ({
      date,
      weather: weatherText(d.daily.weather_code[i]),
      temp_max_c: d.daily.temperature_2m_max[i],
      temp_min_c: d.daily.temperature_2m_min[i],
      rain_probability_pct: d.daily.precipitation_probability_max[i],
    })),
  };
}

// Claude 도구 설명
const tools = [
  {
    name: 'find_spots',
    description:
      '제주 관광지 목록에서 지역과 실내 여부로 장소를 찾아 최대 8곳의 이름 · 지역 · 실내 여부 · 설명을 돌려준다. ' +
      '이 목록에 있는 장소만 추천할 수 있고, 목록 밖 장소는 없다. 결과에 없는 장소를 지어내거나 덧붙이지 말 것. ' +
      '운영시간 · 요금 · 휴무는 담겨 있지 않다.',
    input_schema: {
      type: 'object',
      properties: {
        area: {
          type: 'string',
          enum: AREAS,
          description: '찾을 지역. 동쪽 · 서쪽 · 서귀포 · 제주시 중 하나',
        },
        indoor: {
          type: 'boolean',
          description: 'true 면 실내 장소만, false 면 야외 장소만. 생략하면 구분하지 않는다.',
        },
      },
      required: ['area'],
    },
  },
  {
    name: 'get_weather',
    description:
      '제주 지역의 현재 날씨와 오늘 포함 3일 예보(날씨 · 최고/최저 기온 · 강수확률)를 돌려준다. ' +
      '날씨에 따라 실내/야외 추천이 달라질 때 find_spots 보다 먼저 호출한다. 제주 4개 지역 외에는 조회할 수 없다.',
    input_schema: {
      type: 'object',
      properties: {
        area: {
          type: 'string',
          enum: AREAS,
          description: '날씨를 볼 지역. 동쪽 · 서쪽 · 서귀포 · 제주시 중 하나',
        },
      },
      required: ['area'],
    },
  },
];

const handlers = { find_spots, get_weather };

module.exports = { tools, find_spots, get_weather, handlers, CENTER };
