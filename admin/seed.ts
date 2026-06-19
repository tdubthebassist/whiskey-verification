/**
 * Seed script: migrates the 53 Bar Backroom whiskeys to Supabase.
 * Run: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx src/data/seed.ts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Original 53 whiskeys from data.js
const W: [string, string, string, number, number | null, string, number, number][] = [
  ["Ardbeg", "10", "islay", 46, 10, "강렬한 피트와 타르, 레몬 제스트의 긴 여운", 16000, 190000],
  ["Laphroaig", "10", "islay", 43, 10, "요오드와 바다 내음, 스모키한 약재향", 15000, 170000],
  ["Lagavulin", "16", "islay", 43, 16, "짙은 피트와 셰리의 단맛, 오래 남는 스모크", 24000, 340000],
  ["Bowmore", "12", "islay", 40, 12, "부드러운 스모크와 꿀, 은은한 시트러스", 14000, 150000],
  ["Caol Ila", "12", "islay", 43, 12, "가벼운 피트, 올리브 오일과 레몬의 산뜻함", 15000, 160000],
  ["Bruichladdich", "Classic Laddie", "islay", 50, null, "비피트, 보리향과 해풍의 미네랄", 17000, 210000],
  ["Octomore", "14.1", "islay", 59.1, 5, "압도적인 피트, 다크초콜릿과 검은 후추", 38000, 520000],
  ["Glenmorangie", "10 Original", "highland", 40, 10, "복숭아와 바닐라, 가벼운 꽃향", 13000, 130000],
  ["Aberfeldy", "12", "highland", 40, 12, "꿀과 바닐라, 부드러운 토피", 13000, 140000],
  ["Old Pulteney", "12", "highland", 40, 12, "해풍의 짭짤함과 사과향", 14000, 150000],
  ["GlenDronach", "12", "highland", 43, 12, "셰리, 건포도와 다크초콜릿", 19000, 240000],
  ["Dalmore", "12", "highland", 40, 12, "오렌지 마멀레이드와 초콜릿, 셰리", 21000, 280000],
  ["Oban", "14", "highland", 43, 14, "바다소금과 오렌지, 은은한 스모크", 22000, 300000],
  ["Glenmorangie", "Signet", "highland", 46, null, "진한 초콜릿과 에스프레소, 농밀한 바디", 45000, 720000],
  ["Glenfiddich", "12", "speyside", 40, 12, "서양배와 청사과, 산뜻한 마무리", 12000, 120000],
  ["The Glenlivet", "12", "speyside", 40, 12, "꽃향과 시트러스, 가벼운 바디", 12000, 120000],
  ["Aberlour", "12", "speyside", 40, 12, "셰리와 스파이스, 고소한 견과류", 18000, 220000],
  ["Balvenie", "DoubleWood 12", "speyside", 40, 12, "꿀과 셰리, 따뜻한 오크", 19000, 230000],
  ["Glenfarclas", "105", "speyside", 60, null, "강한 셰리와 크리스마스 케이크", 24000, 320000],
  ["Macallan", "12 Double Cask", "speyside", 40, 12, "셰리와 바닐라, 말린 과일", 28000, 380000],
  ["Macallan", "18 Sherry Oak", "speyside", 43, 18, "풍부한 셰리, 말린 과일과 스파이스", 90000, 1500000],
  ["Jura", "12", "islands", 40, 12, "가벼운 스모크와 토피, 견과류", 14000, 150000],
  ["Arran", "10", "islands", 46, 10, "시트러스와 바닐라, 산뜻함", 15000, 160000],
  ["Talisker", "10", "islands", 45.8, 10, "검은 후추와 바다소금, 스모키한 피니시", 16000, 180000],
  ["Highland Park", "12 Viking Honour", "islands", 40, 12, "헤더 꿀과 가벼운 스모크", 16000, 180000],
  ["Talisker", "Distillers Edition", "islands", 45.8, null, "아몬티야도 셰리와 후추, 깊은 스모크", 26000, 360000],
  ["Glen Scotia", "Double Cask", "campbeltown", 46, null, "셰리와 바닐라, 바다소금", 17000, 200000],
  ["Kilkerran", "12", "campbeltown", 46, 12, "가벼운 피트와 시트러스, 좋은 균형", 22000, 290000],
  ["Springbank", "10", "campbeltown", 46, 10, "짭짤한 피트와 과일, 복합적인 바디", 26000, 360000],
  ["Springbank", "15", "campbeltown", 46, 15, "깊은 셰리와 가죽, 오일리한 질감", 45000, 680000],
  ["Auchentoshan", "12", "lowland", 40, 12, "삼중증류의 부드러움, 시트러스와 아몬드", 14000, 150000],
  ["Glenkinchie", "12", "lowland", 43, 12, "풀향과 레몬, 가벼운 바디", 15000, 160000],
  ["Auchentoshan", "Three Wood", "lowland", 43, null, "셰리와 오렌지, 풍부한 단맛", 18000, 220000],
  ["Nikka", "From The Barrel", "japanese", 51.4, null, "풍부한 바디와 스파이스, 카라멜", 22000, 230000],
  ["Chita", "Single Grain", "japanese", 43, null, "부드러운 바닐라와 꿀, 가벼운 결", 20000, 220000],
  ["Hibiki", "Harmony", "japanese", 43, null, "꿀과 오렌지, 미즈나라의 여운", 45000, 600000],
  ["Hakushu", "12", "japanese", 43, 12, "청량한 민트와 풋사과, 가벼운 스모크", 60000, 950000],
  ["Yamazaki", "12", "japanese", 43, 12, "미즈나라 오크의 백단향, 잘 익은 과일", 60000, 950000],
  ["Jameson", "Original", "irish", 40, null, "부드러운 바닐라와 견과류", 10000, 90000],
  ["Bushmills", "10 Single Malt", "irish", 40, 10, "꿀과 바닐라, 부드러운 몰트", 14000, 150000],
  ["Green Spot", "", "irish", 40, null, "사과와 꿀, 신선한 오크", 21000, 260000],
  ["Redbreast", "12", "irish", 40, 12, "셰리와 스파이스, 풍부한 포트스틸", 22000, 280000],
  ["Redbreast", "15", "irish", 46, 15, "진한 과일과 오크, 묵직한 바디", 38000, 520000],
  ["Maker\u2019s Mark", "", "american", 45, null, "카라멜과 바닐라, 부드러운 휘티드", 12000, 110000],
  ["Buffalo Trace", "", "american", 45, null, "카라멜과 오크, 가벼운 후추", 13000, 120000],
  ["Wild Turkey", "101", "american", 50.5, 8, "강한 스파이스와 카라멜, 오크", 13000, 120000],
  ["Woodford Reserve", "", "american", 43.2, null, "말린 과일과 바닐라, 스파이스", 14000, 140000],
  ["Michter\u2019s", "US\u26051 Bourbon", "american", 45.7, null, "카라멜과 스톤프루트, 부드러움", 18000, 210000],
  ["Booker\u2019s", "Small Batch", "american", 62.5, null, "진한 바닐라와 오크, 강렬한 캐스크 스트렝스", 28000, 380000],
  ["Mackmyra", "Brukswhisky", "world", 41.4, null, "가벼운 과일과 오크, 깔끔함 (스웨덴)", 19000, 220000],
  ["Penderyn", "Madeira", "world", 46, null, "마데이라와 건포도, 크리미한 질감 (웨일스)", 20000, 240000],
  ["Amrut", "Fusion", "world", 50, null, "피트와 과일, 스파이시한 바디 (인도)", 22000, 280000],
  ["Kavalan", "Classic", "world", 40, null, "열대과일과 바닐라, 풍부한 단맛 (대만)", 24000, 300000],
];

const PHOTOS: Record<string, string> = {
  "Bowmore 12": "assets/bottles/bowmore-12.png",
  "Laphroaig 10": "assets/bottles/laphroig_10.png",
};

async function seed() {
  console.log(`Seeding ${W.length} whiskeys...`);

  const rows = W.map((r) => {
    const name = (r[0] + " " + r[1]).trim();
    return {
      brand: r[0],
      expression: r[1],
      region: r[2],
      abv: r[3],
      age: r[4],
      notes: r[5],
      glass_price: r[6],
      bottle_price: r[7],
      cost_price: null,
      photo_url: PHOTOS[name] || null,
      bottle_volume_ml: 700,
    };
  });

  const { data, error } = await supabase.from('whiskeys').insert(rows).select('id');

  if (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }

  console.log(`Inserted ${data.length} whiskeys.`);

  // Verify count
  const { count } = await supabase.from('whiskeys').select('*', { count: 'exact', head: true });
  console.log(`Total whiskeys in DB: ${count}`);

  if (count !== W.length) {
    console.warn(`Expected ${W.length}, got ${count}. Check for duplicates.`);
  } else {
    console.log('Seed complete.');
  }
}

seed();
