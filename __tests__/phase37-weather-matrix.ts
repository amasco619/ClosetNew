/**
 * Phase 3.7 §12 — Required Weather Test Matrix
 * Heavy rain / Moderate rain / Light rain / Dry / Cold+rain / Warm+rain / Cold+dry / Hot+dry
 */
import { generateOutfitPool, EMPTY_AFFINITY } from '../constants/outfitRotation';
import type { WardrobeItem, UserProfile, OccasionTag, WeatherSnapshot } from '../constants/types';

const PH = 'test://ph';
const CREATED = '2025-01-01T00:00:00Z';
const TODAY = '2026-08-12';

function mk(id:string,cat:WardrobeItem['category'],sub:string,col:string,occ:OccasionTag[],extra:Partial<WardrobeItem>={}):WardrobeItem{
  return{id,photoUri:PH,category:cat,subType:sub,colorFamily:col,occasionTags:occ,
    seasonTags:['all-season'],formalityLevel:5,createdAt:CREATED,...extra};
}

const prof:UserProfile={
  name:'T',bodyType:null,eyeColor:null,skinTone:null,undertone:null,
  styleGoalPrimary:'classic',styleGoalSecondary:null,
  lifestyleWork:3,lifestyleCasual:3,lifestyleEvents:2,lifestyleActive:2,lifestyleBrunch:2,
  constraints:{noSleeveless:false,noShortSkirts:false,maxHeelHeight:'any'},
  onboardingComplete:true,
};

// Mixed-weather wardrobe: rain-friendly + rain-averse footwear, warm + cold outerwear
const items:WardrobeItem[]=[
  mk('wm-t1','top','blouse','white',['casual'],{fabric:'silk'}),
  mk('wm-t2','top','knit-top','navy',['casual'],{fabric:'wool'}),
  mk('wm-b1','bottom','jeans','navy',['casual'],{fit:'slim'}),
  mk('wm-b2','bottom','trousers','black',['casual','work'],{fabric:'wool'}),
  mk('wm-o1','outerwear','raincoat','navy',['casual'],{warmthBand:'mild'}),
  mk('wm-o2','outerwear','coat','camel',['casual'],{fabric:'wool',warmthBand:'cold'}),
  mk('wm-o3','outerwear','blazer','black',['casual','work'],{fabric:'wool',warmthBand:'mild'}),
  // Cold+rain-appropriate: parka is RAIN_FRIENDLY_SUBTYPES + warmthBand 'cold'
  mk('wm-o4','outerwear','parka','navy',['casual'],{warmthBand:'cold'}),
  mk('wm-s1','shoes','ankle-boots','black',['casual'],{fabric:'leather'}), // rain-friendly
  mk('wm-s2','shoes','sandals','nude',['casual']),                          // rain-AVERSE
  mk('wm-s3','shoes','loafers','tan',['casual'],{fabric:'leather'}),        // rain-neutral
  mk('wm-g1','bag','tote','black',['casual'],{fabric:'leather'}),
  mk('wm-g2','bag','wicker-bag','natural',['casual']),                       // rain-AVERSE
  mk('wm-j1','jewelry','earrings','gold',['casual'],{metalTone:'gold'}),
];

type Pool = ReturnType<typeof generateOutfitPool>['casual'];
function sandalsIn(p:Pool):boolean{return(p??[]).some(o=>o.components.some(c=>c.matchedItemId==='wm-s2'));}
function wickerIn(p:Pool):boolean{return(p??[]).some(o=>o.components.some(c=>c.matchedItemId==='wm-g2'));}
function outerwearIn(p:Pool):boolean{return(p??[]).every(o=>o.components.some(c=>['wm-o1','wm-o2','wm-o3','wm-o4'].includes(c.matchedItemId??'')));}

// WeatherSnapshot: fetchedAt, lat, lon, currentTempC, highC, lowC, precipProbability, source
function wx(currentTempC:number, lowC:number, precip:number): WeatherSnapshot {
  return { fetchedAt: Date.now(), lat: 51.5, lon: -0.1, currentTempC, highC: currentTempC+3, lowC, precipProbability: precip, source: 'ip' };
}

const HOT_DRY   = wx(35, 28, 0);
const COLD_DRY  = wx(4,  -2, 0);
const WARM_RAIN = wx(22, 18, 0.9);
const COLD_RAIN = wx(6,  2,  0.85);
const HEAVY_RAIN= wx(18, 14, 0.9);
const MOD_RAIN  = wx(18, 14, 0.65);
const LIGHT_RAIN= wx(18, 14, 0.35);
const DRY       = wx(18, 14, 0);

type Check={desc:string;pass:(p:Pool)=>boolean;};
type Case={label:string;checks:Check[];};
const cases:Case[]=[];
let allPass=true;

function test(label:string,weather:WeatherSnapshot,checks:Check[]){
  // Correct signature: (items, profile, mood, reactions, today, wearHistory, affinity, weather)
  const pool=generateOutfitPool(items,prof,null,[],TODAY,[],EMPTY_AFFINITY,weather);
  const casual=pool['casual']??[];
  const results=checks.map(c=>({desc:c.desc,ok:c.pass(casual)}));
  cases.push({label,checks:results as any});
  results.forEach(r=>{if(!r.ok)allPass=false;});
  return casual;
}

test('1. Heavy rain (precip=0.90)', HEAVY_RAIN,[
  {desc:'pool non-empty',           pass:p=>(p?.length??0)>=1},
  {desc:'sandals absent',           pass:p=>!sandalsIn(p)},
  {desc:'wicker-bag absent',        pass:p=>!wickerIn(p)},
]);
test('2. Moderate rain (precip=0.65)', MOD_RAIN,[
  {desc:'pool non-empty',           pass:p=>(p?.length??0)>=1},
  {desc:'sandals absent (≥0.6 gate)', pass:p=>!sandalsIn(p)},
  {desc:'wicker-bag absent (≥0.6 gate)',pass:p=>!wickerIn(p)},
]);
const lightPool=test('3. Light rain (precip=0.35)', LIGHT_RAIN,[
  {desc:'pool non-empty',           pass:p=>(p?.length??0)>=1},
  {desc:'gate not over-triggered (precip<0.6 → no rain filter)', pass:p=>(p?.length??0)>=2},
]);
test('4. Dry weather (precip=0)', DRY,[
  {desc:'pool non-empty',           pass:p=>(p?.length??0)>=1},
  {desc:'full pool (no weather suppression)', pass:p=>(p?.length??0)>=4},
]);
test('5. Cold + rain (lowC=2, precip=0.85)', COLD_RAIN,[
  {desc:'pool non-empty',           pass:p=>(p?.length??0)>=1},
  {desc:'sandals absent',           pass:p=>!sandalsIn(p)},
  {desc:'wicker-bag absent',        pass:p=>!wickerIn(p)},
  {desc:'outerwear in every outfit (cold gate)', pass:p=>outerwearIn(p)},
]);
test('6. Warm + rain (lowC=18, precip=0.90)', WARM_RAIN,[
  {desc:'pool non-empty',           pass:p=>(p?.length??0)>=1},
  {desc:'sandals absent',           pass:p=>!sandalsIn(p)},
  {desc:'wicker-bag absent',        pass:p=>!wickerIn(p)},
]);
test('7. Cold + dry (lowC=-2, precip=0)', COLD_DRY,[
  {desc:'pool non-empty',           pass:p=>(p?.length??0)>=1},
  {desc:'outerwear in every outfit (cold gate)', pass:p=>outerwearIn(p)},
]);
test('8. Hot + dry (tempC=35, precip=0)', HOT_DRY,[
  {desc:'pool non-empty',           pass:p=>(p?.length??0)>=1},
]);

console.log('\n' + '═'.repeat(68));
console.log('  PHASE 3.7 §12 — WEATHER TEST MATRIX');
console.log('═'.repeat(68));
for(const c of cases){
  const all=(c.checks as any[]).every((x:any)=>x.ok);
  console.log(`\n  ${all?'✅':'❌'} ${c.label}`);
  for(const ch of c.checks as any[]){
    console.log(`    ${ch.ok?'✓':'✗'} ${ch.desc}`);
  }
}
console.log('\n' + '═'.repeat(68));
console.log(`  Result: ${allPass?'ALL 8 CONDITIONS PASS ✓':'FAILURES DETECTED ✗'}`);
console.log('═'.repeat(68)+'\n');
if(!allPass)process.exit(1);
