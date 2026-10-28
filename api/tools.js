// find_spots 도구: index.json 의 spots 에서만 골라 돌려준다(목록 밖 장소는 만들지 않는다).
const { spots } = require('../index.json');

const MAX_RESULTS = 8;
const AREAS = ['동쪽', '서쪽', '서귀포', '제주시'];

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
];

module.exports = { tools, find_spots };
