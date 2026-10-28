// Vercel 서버리스 함수: /api/spots?area=동쪽&indoor=true → find_spots 결과 + 지역 중심 좌표
const { find_spots, CENTER } = require('./tools');

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
