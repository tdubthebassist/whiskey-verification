import type { WhiskeyInput } from '../types';

/**
 * All 52 whiskeys from the Bar Backroom hardcoded menu (index.html).
 * Used for bulk-importing into the Supabase database.
 */
export const MENU_WHISKEYS: WhiskeyInput[] = [
  // ---- Islay ----
  { brand: 'Ardbeg', expression: '10', region: 'islay', abv: 46, age: 10, notes: '강렬한 피트와 타르, 레몬 제스트의 긴 여운', glass_price: 16000, bottle_price: 190000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Laphroaig', expression: '10', region: 'islay', abv: 43, age: 10, notes: '요오드와 바다 내음, 스모키한 약재향', glass_price: 15000, bottle_price: 170000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Lagavulin', expression: '16', region: 'islay', abv: 43, age: 16, notes: '짙은 피트와 셰리의 단맛, 오래 남는 스모크', glass_price: 24000, bottle_price: 340000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Bowmore', expression: '12', region: 'islay', abv: 40, age: 12, notes: '부드러운 스모크와 꿀, 은은한 시트러스', glass_price: 14000, bottle_price: 150000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Caol Ila', expression: '12', region: 'islay', abv: 43, age: 12, notes: '가벼운 피트, 올리브 오일과 레몬의 산뜻함', glass_price: 15000, bottle_price: 160000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Bruichladdich', expression: 'Classic Laddie', region: 'islay', abv: 50, age: null, notes: '비피트, 보리향과 해풍의 미네랄', glass_price: 17000, bottle_price: 210000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Octomore', expression: '14.1', region: 'islay', abv: 59.1, age: 5, notes: '압도적인 피트, 다크초콜릿과 검은 후추', glass_price: 38000, bottle_price: 520000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  // ---- Highland ----
  { brand: 'Glenmorangie', expression: '10 Original', region: 'highland', abv: 40, age: 10, notes: '복숭아와 바닐라, 가벼운 꽃향', glass_price: 13000, bottle_price: 130000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Aberfeldy', expression: '12', region: 'highland', abv: 40, age: 12, notes: '꿀과 바닐라, 부드러운 토피', glass_price: 13000, bottle_price: 140000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Old Pulteney', expression: '12', region: 'highland', abv: 40, age: 12, notes: '해풍의 짭짤함과 사과향', glass_price: 14000, bottle_price: 150000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'GlenDronach', expression: '12', region: 'highland', abv: 43, age: 12, notes: '셰리, 건포도와 다크초콜릿', glass_price: 19000, bottle_price: 240000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Dalmore', expression: '12', region: 'highland', abv: 40, age: 12, notes: '오렌지 마멀레이드와 초콜릿, 셰리', glass_price: 21000, bottle_price: 280000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Oban', expression: '14', region: 'highland', abv: 43, age: 14, notes: '바다소금과 오렌지, 은은한 스모크', glass_price: 22000, bottle_price: 300000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Glenmorangie', expression: 'Signet', region: 'highland', abv: 46, age: null, notes: '진한 초콜릿과 에스프레소, 농밀한 바디', glass_price: 45000, bottle_price: 720000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  // ---- Speyside ----
  { brand: 'Glenfiddich', expression: '12', region: 'speyside', abv: 40, age: 12, notes: '서양배와 청사과, 산뜻한 마무리', glass_price: 12000, bottle_price: 120000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'The Glenlivet', expression: '12', region: 'speyside', abv: 40, age: 12, notes: '꽃향과 시트러스, 가벼운 바디', glass_price: 12000, bottle_price: 120000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Aberlour', expression: '12', region: 'speyside', abv: 40, age: 12, notes: '셰리와 스파이스, 고소한 견과류', glass_price: 18000, bottle_price: 220000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Balvenie', expression: 'DoubleWood 12', region: 'speyside', abv: 40, age: 12, notes: '꿀과 셰리, 따뜻한 오크', glass_price: 19000, bottle_price: 230000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Glenfarclas', expression: '105', region: 'speyside', abv: 60, age: null, notes: '강한 셰리와 크리스마스 케이크', glass_price: 24000, bottle_price: 320000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Macallan', expression: '12 Double Cask', region: 'speyside', abv: 40, age: 12, notes: '셰리와 바닐라, 말린 과일', glass_price: 28000, bottle_price: 380000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Macallan', expression: '18 Sherry Oak', region: 'speyside', abv: 43, age: 18, notes: '풍부한 셰리, 말린 과일과 스파이스', glass_price: 90000, bottle_price: 1500000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  // ---- Islands ----
  { brand: 'Jura', expression: '12', region: 'islands', abv: 40, age: 12, notes: '가벼운 스모크와 토피, 견과류', glass_price: 14000, bottle_price: 150000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Arran', expression: '10', region: 'islands', abv: 46, age: 10, notes: '시트러스와 바닐라, 산뜻함', glass_price: 15000, bottle_price: 160000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Talisker', expression: '10', region: 'islands', abv: 45.8, age: 10, notes: '검은 후추와 바다소금, 스모키한 피니시', glass_price: 16000, bottle_price: 180000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Highland Park', expression: '12 Viking Honour', region: 'islands', abv: 40, age: 12, notes: '헤더 꿀과 가벼운 스모크', glass_price: 16000, bottle_price: 180000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Talisker', expression: 'Distillers Edition', region: 'islands', abv: 45.8, age: null, notes: '아몬티야도 셰리와 후추, 깊은 스모크', glass_price: 26000, bottle_price: 360000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  // ---- Campbeltown ----
  { brand: 'Glen Scotia', expression: 'Double Cask', region: 'campbeltown', abv: 46, age: null, notes: '셰리와 바닐라, 바다소금', glass_price: 17000, bottle_price: 200000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Kilkerran', expression: '12', region: 'campbeltown', abv: 46, age: 12, notes: '가벼운 피트와 시트러스, 좋은 균형', glass_price: 22000, bottle_price: 290000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Springbank', expression: '10', region: 'campbeltown', abv: 46, age: 10, notes: '짭짤한 피트와 과일, 복합적인 바디', glass_price: 26000, bottle_price: 360000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Springbank', expression: '15', region: 'campbeltown', abv: 46, age: 15, notes: '깊은 셰리와 가죽, 오일리한 질감', glass_price: 45000, bottle_price: 680000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  // ---- Lowland ----
  { brand: 'Auchentoshan', expression: '12', region: 'lowland', abv: 40, age: 12, notes: '삼중증류의 부드러움, 시트러스와 아몬드', glass_price: 14000, bottle_price: 150000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Glenkinchie', expression: '12', region: 'lowland', abv: 43, age: 12, notes: '풀향과 레몬, 가벼운 바디', glass_price: 15000, bottle_price: 160000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Auchentoshan', expression: 'Three Wood', region: 'lowland', abv: 43, age: null, notes: '셰리와 오렌지, 풍부한 단맛', glass_price: 18000, bottle_price: 220000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  // ---- Japanese ----
  { brand: 'Nikka', expression: 'From The Barrel', region: 'japanese', abv: 51.4, age: null, notes: '풍부한 바디와 스파이스, 카라멜', glass_price: 22000, bottle_price: 230000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Chita', expression: 'Single Grain', region: 'japanese', abv: 43, age: null, notes: '부드러운 바닐라와 꿀, 가벼운 결', glass_price: 20000, bottle_price: 220000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Hibiki', expression: 'Harmony', region: 'japanese', abv: 43, age: null, notes: '꿀과 오렌지, 미즈나라의 여운', glass_price: 45000, bottle_price: 600000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Hakushu', expression: '12', region: 'japanese', abv: 43, age: 12, notes: '청량한 민트와 풋사과, 가벼운 스모크', glass_price: 60000, bottle_price: 950000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Yamazaki', expression: '12', region: 'japanese', abv: 43, age: 12, notes: '미즈나라 오크의 백단향, 잘 익은 과일', glass_price: 60000, bottle_price: 950000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  // ---- Irish ----
  { brand: 'Jameson', expression: 'Original', region: 'irish', abv: 40, age: null, notes: '부드러운 바닐라와 견과류', glass_price: 10000, bottle_price: 90000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Bushmills', expression: '10 Single Malt', region: 'irish', abv: 40, age: 10, notes: '꿀과 바닐라, 부드러운 몰트', glass_price: 14000, bottle_price: 150000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Green Spot', expression: '', region: 'irish', abv: 40, age: null, notes: '사과와 꿀, 신선한 오크', glass_price: 21000, bottle_price: 260000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Redbreast', expression: '12', region: 'irish', abv: 40, age: 12, notes: '셰리와 스파이스, 풍부한 포트스틸', glass_price: 22000, bottle_price: 280000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Redbreast', expression: '15', region: 'irish', abv: 46, age: 15, notes: '진한 과일과 오크, 묵직한 바디', glass_price: 38000, bottle_price: 520000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  // ---- American ----
  { brand: "Maker\u2019s Mark", expression: '', region: 'american', abv: 45, age: null, notes: '카라멜과 바닐라, 부드러운 휘티드', glass_price: 12000, bottle_price: 110000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Buffalo Trace', expression: '', region: 'american', abv: 45, age: null, notes: '카라멜과 오크, 가벼운 후추', glass_price: 13000, bottle_price: 120000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Wild Turkey', expression: '101', region: 'american', abv: 50.5, age: 8, notes: '강한 스파이스와 카라멜, 오크', glass_price: 13000, bottle_price: 120000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Woodford Reserve', expression: '', region: 'american', abv: 43.2, age: null, notes: '말린 과일과 바닐라, 스파이스', glass_price: 14000, bottle_price: 140000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: "Michter\u2019s", expression: 'US\u26051 Bourbon', region: 'american', abv: 45.7, age: null, notes: '카라멜과 스톤프루트, 부드러움', glass_price: 18000, bottle_price: 210000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: "Booker\u2019s", expression: 'Small Batch', region: 'american', abv: 62.5, age: null, notes: '진한 바닐라와 오크, 강렬한 캐스크 스트렝스', glass_price: 28000, bottle_price: 380000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  // ---- World ----
  { brand: 'Mackmyra', expression: 'Brukswhisky', region: 'world', abv: 41.4, age: null, notes: '가벼운 과일과 오크, 깔끔함 (스웨덴)', glass_price: 19000, bottle_price: 220000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Penderyn', expression: 'Madeira', region: 'world', abv: 46, age: null, notes: '마데이라와 건포도, 크리미한 질감 (웨일스)', glass_price: 20000, bottle_price: 240000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Amrut', expression: 'Fusion', region: 'world', abv: 50, age: null, notes: '피트와 과일, 스파이시한 바디 (인도)', glass_price: 22000, bottle_price: 280000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
  { brand: 'Kavalan', expression: 'Classic', region: 'world', abv: 40, age: null, notes: '열대과일과 바닐라, 풍부한 단맛 (대만)', glass_price: 24000, bottle_price: 300000, cost_price: null, photo_url: null, bottle_volume_ml: 700 },
];
