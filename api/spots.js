// Vercel 서버리스 함수: /api/spots?area=동쪽&indoor=true → find_spots 결과 + 지역 중심 좌표
const { find_spots } = require('./tools');

// 목록에 장소별 좌표가 없어서 지역 중심점만 쓴다(근사값).
const CENTER = {
  동쪽: [33.46, 126.88],
  서쪽: [33.36, 126.3],
  서귀포: [33.25, 126.56],
  제주시: [33.51, 126.52],
};

module.exports = (req, res) => {
  const { area, indoor } = req.query;
  const result = find_spots({
    area,
    indoor: indoor === undefined || indoor === '' ? undefined : indoor === 'true',
  });
  if (result.error) {
    return res.status(400).json(result);
  }
  return res.status(200).json({ ...result, center: CENTER[area] });
};
