import type { ReferenceWhiskey } from '../types';

/**
 * Curated reference list of common whiskeys for search/autocomplete.
 * When a bar owner searches for a whiskey not yet on their menu,
 * this list provides pre-fill data (brand, expression, region, ABV, age, notes).
 *
 * Compiled from the original 53 Bar Backroom whiskeys plus additional
 * top-selling brands across all regions.
 */
export const REFERENCE_WHISKEYS: ReferenceWhiskey[] = [
  // ---- Islay ----
  { brand: 'Ardbeg', expression: '10', region: 'islay', abv: 46, age: 10, notes: '강렬한 피트와 타르, 레몬 제스트의 긴 여운' },
  { brand: 'Ardbeg', expression: 'Uigeadail', region: 'islay', abv: 54.2, age: null, notes: '피트와 셰리의 조화, 다크초콜릿과 스모크' },
  { brand: 'Ardbeg', expression: 'Corryvreckan', region: 'islay', abv: 57.1, age: null, notes: '깊은 피트, 블랙페퍼와 다크베리' },
  { brand: 'Laphroaig', expression: '10', region: 'islay', abv: 43, age: 10, notes: '요오드와 바다 내음, 스모키한 약재향' },
  { brand: 'Laphroaig', expression: 'Quarter Cask', region: 'islay', abv: 48, age: null, notes: '바닐라와 코코넛, 강렬한 피트' },
  { brand: 'Lagavulin', expression: '16', region: 'islay', abv: 43, age: 16, notes: '짙은 피트와 셰리의 단맛, 오래 남는 스모크' },
  { brand: 'Lagavulin', expression: '8', region: 'islay', abv: 48, age: 8, notes: '가벼운 피트, 시트러스와 바닐라' },
  { brand: 'Bowmore', expression: '12', region: 'islay', abv: 40, age: 12, notes: '부드러운 스모크와 꿀, 은은한 시트러스' },
  { brand: 'Bowmore', expression: '15', region: 'islay', abv: 43, age: 15, notes: '다크초콜릿과 셰리, 깊은 스모크' },
  { brand: 'Caol Ila', expression: '12', region: 'islay', abv: 43, age: 12, notes: '가벼운 피트, 올리브 오일과 레몬의 산뜻함' },
  { brand: 'Bruichladdich', expression: 'Classic Laddie', region: 'islay', abv: 50, age: null, notes: '비피트, 보리향과 해풍의 미네랄' },
  { brand: 'Bruichladdich', expression: 'Port Charlotte 10', region: 'islay', abv: 50, age: 10, notes: '헤비피트, 스모크와 과일의 균형' },
  { brand: 'Octomore', expression: '14.1', region: 'islay', abv: 59.1, age: 5, notes: '압도적인 피트, 다크초콜릿과 검은 후추' },
  { brand: 'Bunnahabhain', expression: '12', region: 'islay', abv: 46.3, age: 12, notes: '비피트, 견과류와 셰리, 바다소금' },
  // ---- Highland ----
  { brand: 'Glenmorangie', expression: '10 Original', region: 'highland', abv: 40, age: 10, notes: '복숭아와 바닐라, 가벼운 꽃향' },
  { brand: 'Glenmorangie', expression: '18', region: 'highland', abv: 43, age: 18, notes: '꽃향과 오크, 풍부한 바닐라' },
  { brand: 'Glenmorangie', expression: 'Signet', region: 'highland', abv: 46, age: null, notes: '진한 초콜릿과 에스프레소, 농밀한 바디' },
  { brand: 'Aberfeldy', expression: '12', region: 'highland', abv: 40, age: 12, notes: '꿀과 바닐라, 부드러운 토피' },
  { brand: 'Old Pulteney', expression: '12', region: 'highland', abv: 40, age: 12, notes: '해풍의 짭짤함과 사과향' },
  { brand: 'GlenDronach', expression: '12', region: 'highland', abv: 43, age: 12, notes: '셰리, 건포도와 다크초콜릿' },
  { brand: 'GlenDronach', expression: '18 Allardice', region: 'highland', abv: 46, age: 18, notes: '풍부한 셰리, 오렌지와 다크카카오' },
  { brand: 'Dalmore', expression: '12', region: 'highland', abv: 40, age: 12, notes: '오렌지 마멀레이드와 초콜릿, 셰리' },
  { brand: 'Dalmore', expression: '15', region: 'highland', abv: 40, age: 15, notes: '만다린과 셰리, 풍부한 과일' },
  { brand: 'Oban', expression: '14', region: 'highland', abv: 43, age: 14, notes: '바다소금과 오렌지, 은은한 스모크' },
  { brand: 'Clynelish', expression: '14', region: 'highland', abv: 46, age: 14, notes: '왁스와 꿀, 해풍의 미네랄' },
  // ---- Speyside ----
  { brand: 'Glenfiddich', expression: '12', region: 'speyside', abv: 40, age: 12, notes: '서양배와 청사과, 산뜻한 마무리' },
  { brand: 'Glenfiddich', expression: '15 Solera', region: 'speyside', abv: 40, age: 15, notes: '셰리와 바닐라, 견과류의 풍미' },
  { brand: 'Glenfiddich', expression: '18', region: 'speyside', abv: 40, age: 18, notes: '오크와 말린 과일, 풍부한 바디' },
  { brand: 'The Glenlivet', expression: '12', region: 'speyside', abv: 40, age: 12, notes: '꽃향과 시트러스, 가벼운 바디' },
  { brand: 'The Glenlivet', expression: '18', region: 'speyside', abv: 40, age: 18, notes: '오렌지와 스파이스, 따뜻한 오크' },
  { brand: 'Aberlour', expression: '12', region: 'speyside', abv: 40, age: 12, notes: '셰리와 스파이스, 고소한 견과류' },
  { brand: 'Aberlour', expression: "A'bunadh", region: 'speyside', abv: 60, age: null, notes: '캐스크 스트렝스, 강렬한 셰리와 다크초콜릿' },
  { brand: 'Balvenie', expression: 'DoubleWood 12', region: 'speyside', abv: 40, age: 12, notes: '꿀과 셰리, 따뜻한 오크' },
  { brand: 'Balvenie', expression: 'Caribbean Cask 14', region: 'speyside', abv: 43, age: 14, notes: '열대과일과 바닐라, 토피' },
  { brand: 'Glenfarclas', expression: '105', region: 'speyside', abv: 60, age: null, notes: '강한 셰리와 크리스마스 케이크' },
  { brand: 'Macallan', expression: '12 Double Cask', region: 'speyside', abv: 40, age: 12, notes: '셰리와 바닐라, 말린 과일' },
  { brand: 'Macallan', expression: '18 Sherry Oak', region: 'speyside', abv: 43, age: 18, notes: '풍부한 셰리, 말린 과일과 스파이스' },
  // ---- Islands ----
  { brand: 'Talisker', expression: '10', region: 'islands', abv: 45.8, age: 10, notes: '검은 후추와 바다소금, 스모키한 피니시' },
  { brand: 'Talisker', expression: 'Distillers Edition', region: 'islands', abv: 45.8, age: null, notes: '아몬티야도 셰리와 후추, 깊은 스모크' },
  { brand: 'Highland Park', expression: '12 Viking Honour', region: 'islands', abv: 40, age: 12, notes: '헤더 꿀과 가벼운 스모크' },
  { brand: 'Highland Park', expression: '18 Viking Pride', region: 'islands', abv: 43, age: 18, notes: '꿀과 셰리, 깊은 오크와 스모크' },
  { brand: 'Jura', expression: '12', region: 'islands', abv: 40, age: 12, notes: '가벼운 스모크와 토피, 견과류' },
  { brand: 'Arran', expression: '10', region: 'islands', abv: 46, age: 10, notes: '시트러스와 바닐라, 산뜻함' },
  // ---- Campbeltown ----
  { brand: 'Springbank', expression: '10', region: 'campbeltown', abv: 46, age: 10, notes: '짭짤한 피트와 과일, 복합적인 바디' },
  { brand: 'Springbank', expression: '15', region: 'campbeltown', abv: 46, age: 15, notes: '깊은 셰리와 가죽, 오일리한 질감' },
  { brand: 'Kilkerran', expression: '12', region: 'campbeltown', abv: 46, age: 12, notes: '가벼운 피트와 시트러스, 좋은 균형' },
  { brand: 'Glen Scotia', expression: 'Double Cask', region: 'campbeltown', abv: 46, age: null, notes: '셰리와 바닐라, 바다소금' },
  // ---- Lowland ----
  { brand: 'Auchentoshan', expression: '12', region: 'lowland', abv: 40, age: 12, notes: '삼중증류의 부드러움, 시트러스와 아몬드' },
  { brand: 'Auchentoshan', expression: 'Three Wood', region: 'lowland', abv: 43, age: null, notes: '셰리와 오렌지, 풍부한 단맛' },
  { brand: 'Glenkinchie', expression: '12', region: 'lowland', abv: 43, age: 12, notes: '풀향과 레몬, 가벼운 바디' },
  // ---- Japanese ----
  { brand: 'Yamazaki', expression: '12', region: 'japanese', abv: 43, age: 12, notes: '미즈나라 오크의 백단향, 잘 익은 과일' },
  { brand: 'Yamazaki', expression: '18', region: 'japanese', abv: 43, age: 18, notes: '깊은 미즈나라, 말린 과일과 초콜릿' },
  { brand: 'Hakushu', expression: '12', region: 'japanese', abv: 43, age: 12, notes: '청량한 민트와 풋사과, 가벼운 스모크' },
  { brand: 'Hibiki', expression: 'Harmony', region: 'japanese', abv: 43, age: null, notes: '꿀과 오렌지, 미즈나라의 여운' },
  { brand: 'Nikka', expression: 'From The Barrel', region: 'japanese', abv: 51.4, age: null, notes: '풍부한 바디와 스파이스, 카라멜' },
  { brand: 'Nikka', expression: 'Coffey Grain', region: 'japanese', abv: 45, age: null, notes: '부드러운 바닐라와 옥수수, 가벼운 결' },
  { brand: 'Chita', expression: 'Single Grain', region: 'japanese', abv: 43, age: null, notes: '부드러운 바닐라와 꿀, 가벼운 결' },
  { brand: 'Suntory', expression: 'Toki', region: 'japanese', abv: 43, age: null, notes: '풋사과와 꿀, 가볍고 산뜻한 블렌드' },
  // ---- Irish ----
  { brand: 'Jameson', expression: 'Original', region: 'irish', abv: 40, age: null, notes: '부드러운 바닐라와 견과류' },
  { brand: 'Jameson', expression: 'Black Barrel', region: 'irish', abv: 40, age: null, notes: '더블 차르드 오크, 토피와 견과류' },
  { brand: 'Bushmills', expression: '10 Single Malt', region: 'irish', abv: 40, age: 10, notes: '꿀과 바닐라, 부드러운 몰트' },
  { brand: 'Green Spot', expression: '', region: 'irish', abv: 40, age: null, notes: '사과와 꿀, 신선한 오크' },
  { brand: 'Redbreast', expression: '12', region: 'irish', abv: 40, age: 12, notes: '셰리와 스파이스, 풍부한 포트스틸' },
  { brand: 'Redbreast', expression: '15', region: 'irish', abv: 46, age: 15, notes: '진한 과일과 오크, 묵직한 바디' },
  // ---- American / Bourbon ----
  { brand: "Maker's Mark", expression: '', region: 'american', abv: 45, age: null, notes: '카라멜과 바닐라, 부드러운 휘티드' },
  { brand: 'Buffalo Trace', expression: '', region: 'american', abv: 45, age: null, notes: '카라멜과 오크, 가벼운 후추' },
  { brand: 'Wild Turkey', expression: '101', region: 'american', abv: 50.5, age: 8, notes: '강한 스파이스와 카라멜, 오크' },
  { brand: 'Woodford Reserve', expression: '', region: 'american', abv: 43.2, age: null, notes: '말린 과일과 바닐라, 스파이스' },
  { brand: "Michter's", expression: 'US★1 Bourbon', region: 'american', abv: 45.7, age: null, notes: '카라멜과 스톤프루트, 부드러움' },
  { brand: "Booker's", expression: 'Small Batch', region: 'american', abv: 62.5, age: null, notes: '진한 바닐라와 오크, 강렬한 캐스크 스트렝스' },
  { brand: 'Four Roses', expression: 'Single Barrel', region: 'american', abv: 50, age: null, notes: '꽃향과 과일, 스파이시한 오크' },
  { brand: 'Elijah Craig', expression: 'Small Batch', region: 'american', abv: 47, age: null, notes: '바닐라와 카라멜, 따뜻한 오크' },
  { brand: 'Knob Creek', expression: '9 Year', region: 'american', abv: 50, age: 9, notes: '강렬한 오크와 카라멜, 풍부한 바디' },
  // ---- World ----
  { brand: 'Kavalan', expression: 'Classic', region: 'world', abv: 40, age: null, notes: '열대과일과 바닐라, 풍부한 단맛 (대만)' },
  { brand: 'Kavalan', expression: 'Solist Vinho Barrique', region: 'world', abv: 57.8, age: null, notes: '열대과일과 셰리, 강렬한 풍미 (대만)' },
  { brand: 'Amrut', expression: 'Fusion', region: 'world', abv: 50, age: null, notes: '피트와 과일, 스파이시한 바디 (인도)' },
  { brand: 'Penderyn', expression: 'Madeira', region: 'world', abv: 46, age: null, notes: '마데이라와 건포도, 크리미한 질감 (웨일스)' },
  { brand: 'Mackmyra', expression: 'Brukswhisky', region: 'world', abv: 41.4, age: null, notes: '가벼운 과일과 오크, 깔끔함 (스웨덴)' },
  { brand: 'Starward', expression: 'Nova', region: 'world', abv: 41, age: null, notes: '레드와인 캐스크, 과일과 스파이스 (호주)' },
];

/**
 * Fuzzy search whiskeys by query string.
 * Matches against brand + expression, case-insensitive, partial match.
 */
export function searchWhiskeys(
  query: string,
  list: ReferenceWhiskey[],
): ReferenceWhiskey[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return list.filter((w) => {
    const fullName = `${w.brand} ${w.expression}`.toLowerCase();
    return fullName.includes(q) || w.brand.toLowerCase().includes(q);
  });
}
