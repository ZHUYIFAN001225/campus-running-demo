import { SPOTS, customPoint } from './campus.js';

export function discoveryFixtures(now=Date.now(),owner='lin',suffix='v4') {
  const walkway=customPoint({x:294,y:235,name:'设计楼北侧 · 连廊公共点'}),middle=customPoint({x:150,y:104,name:'北门与西区驿站之间 · 公共步道'});
  const entries=[
    ['north-food','north','food',100,15,200,'急：北门取餐，送到第一食堂'],
    ['north-design','north','design',200,45,0,'北门小包裹，带到设计楼'],
    ['north-library','north','library',100,45,0,'北门取资料，带到图书馆'],
    ['north-dorm','north','dorm3',300,50,0,'北门小件，送到三号楼'],
    ['north-walkway','north',walkway,200,35,0,'北门取件，到设计楼北侧连廊'],
    ['east-design','east','design',200,45,0,'东门取小包裹，送到设计楼'],
    ['east-dorm','east','dorm2',300,60,0,'东门取资料，送到二号楼'],
    ['west-middle','west',middle,200,40,0,'西区驿站取件，送到步道中间'],
    ['design-south','design','south',200,50,0,'设计楼取文件，带到南门打印店']
  ];
  return entries.map(([key,pickup,dropoff,base,minutes,bonus,title])=>({
    id:`nearby-${key}-${suffix}`,demoScenario:'nearby',demoExample:key,school:'nancheng',owner,runner:null,
    category:'parcel',title,pickup:SPOTS[pickup].name,pickupSpot:pickup,pickupPoint:null,
    dropoff:typeof dropoff==='string'?SPOTS[dropoff].name:dropoff.name,dropoffSpot:typeof dropoff==='string'?dropoff:null,dropoffPoint:typeof dropoff==='object'?dropoff:null,
    reward:base+bonus,baseReward:base,urgentBonus:bonus,urgent:bonus>0,budget:0,prepaid:base+bonus,buy:false,
    item:'虚构轻小包裹 × 1',description:'附近需求演示；按约定公共位置当面交接。',size:'轻小件 · 约1kg以内',sensitive:'虚构取件码 NC-4102',
    handoff:'meet',dropConsent:false,pickedUpAt:null,deadline:now+minutes*60000,readyAt:now,createdAt:now,status:'open',
    purchase:null,change:null,cancelRequest:null,dispute:null,settlement:null,reviews:[],events:[{text:'虚构需求已发布，模拟预付已记录',at:now}]
  }));
}
