import os

html = '''<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>掇山如画</title>
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }
}
</script>
<style>
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{margin:0;height:100%;overflow:hidden;background:#2a2a2a;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
  #canvas{display:block;width:100%;height:100%;touch-action:none}
  .title-bar{position:absolute;top:0;left:0;right:0;padding:18px 22px 30px;
    background:linear-gradient(to bottom,rgba(0,0,0,.55),transparent);color:#fff;pointer-events:none;z-index:5;
    transition:opacity .3s ease}
  .title-bar.hide{opacity:0}
  .title-main{font-size:26px;font-weight:600;letter-spacing:1px}
  .title-sub{font-size:15px;opacity:.75;margin-top:6px;letter-spacing:1px}
  .bottom-bar{position:absolute;bottom:0;left:0;right:0;padding:18px 22px calc(20px + env(safe-area-inset-bottom));
    background:linear-gradient(to top,rgba(0,0,0,.6),transparent);color:#fff;z-index:5}
  .tip{font-size:14px;margin-bottom:12px;opacity:.95}
  .progress{display:flex;gap:6px}
  .dot{flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.25);transition:background .4s}
  .dot.active{background:#ffd24a}
  .dot.done{background:rgba(255,210,74,.55)}
  .controls{position:absolute;top:16px;right:14px;z-index:6;display:flex;gap:10px}
  .btn{width:38px;height:38px;border:none;border-radius:50%;background:rgba(255,255,255,.18);
    color:#fff;backdrop-filter:blur(6px);font-size:17px;cursor:pointer;
    display:flex;align-items:center;justify-content:center}
  .btn:active{background:rgba(255,255,255,.32)}
  .loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
    color:#fff;z-index:10;text-align:center;transition:opacity .4s}
  .loading.hide{opacity:0;pointer-events:none}
  .loading .bar{width:200px;height:3px;background:rgba(255,255,255,.2);border-radius:2px;margin-top:12px;overflow:hidden}
  .loading .bar-fill{height:100%;width:0%;background:#ffd24a;border-radius:2px;transition:width .3s}
  .loading .txt{font-size:14px;opacity:.85}
  .enter-mask{position:absolute;inset:0;z-index:20;background:#2a2a2a;
    display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;
    transition:opacity .6s}
  .enter-mask.hide{opacity:0;pointer-events:none}
  .enter-mask .play{width:80px;height:80px;border-radius:50%;
    border:2px solid rgba(255,255,255,.5);display:flex;align-items:center;
    justify-content:center;font-size:30px;padding-left:6px;margin:0 auto}
  .enter-mask .label{margin-top:18px;font-size:15px;opacity:.8;text-align:center}
</style>
</head>
<body>
<canvas id="canvas"></canvas>

<div class="title-bar" id="titleBar">
  <div class="title-main" id="titleMain">掇山如画</div>
  <div class="title-sub" id="titleSub">第 1 / 3 步</div>
</div>
<div class="controls">
  <button class="btn" id="muteBtn" title="音乐开关">&#128266;</button>
</div>
<div class="bottom-bar">
  <div class="tip" id="tip">点击屏幕：升起第1组</div>
  <div class="progress" id="progress"></div>
</div>

<div class="loading" id="loading">
  <div class="txt" id="loadTxt">加载中...</div>
  <div class="bar"><div class="bar-fill" id="barFill"></div></div>
</div>

<div class="enter-mask" id="enterMask" style="display:none">
  <div>
    <div class="play">&#9654;</div>
    <div class="label">点击进入</div>
  </div>
</div>

<audio id="bgm" loop preload="auto" src="bgm.mp3"></audio>

<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const titleBar=document.getElementById('titleBar');
const titleMain=document.getElementById('titleMain');
const titleSub=document.getElementById('titleSub');
const tip=document.getElementById('tip');
const progress=document.getElementById('progress');
const loading=document.getElementById('loading');
const loadTxt=document.getElementById('loadTxt');
const barFill=document.getElementById('barFill');
const enterMask=document.getElementById('enterMask');
const bgm=document.getElementById('bgm');
const muteBtn=document.getElementById('muteBtn');

let groups=[];
let groupData=[];
let currentStep=0;
let isAnimating=false;
let modelCenter=new THREE.Vector3();
let maxDim=0;

const canvas=document.getElementById('canvas');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.setSize(window.innerWidth,window.innerHeight);
renderer.setClearColor(0x2a2a2a);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.shadowMap.radius=55;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=0.88;
renderer.outputColorSpace=THREE.SRGBColorSpace;

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(45,window.innerWidth/window.innerHeight,0.1,100000);

const pmrem=new THREE.PMREMGenerator(renderer);
scene.environment=pmrem.fromScene(new RoomEnvironment(),0.04).texture;

const dirLight=new THREE.DirectionalLight(0xffffff,1.5);
dirLight.castShadow=true;
dirLight.shadow.mapSize.set(2048,2048);
dirLight.shadow.bias=-0.0005;
dirLight.shadow.radius=55;
dirLight.shadow.blurSamples=80;
scene.add(dirLight);
scene.add(dirLight.target);

const ambLight=new THREE.AmbientLight(0xffffff,0.35);
scene.add(ambLight);

const controls=new OrbitControls(camera,canvas);
controls.enableDamping=true;
controls.dampingFactor=0.08;
controls.autoRotate=true;
controls.autoRotateSpeed=0.5;
controls.enablePan=false;

const loadingManager=new THREE.LoadingManager();
loadingManager.onProgress=(url,loaded,total)=>{
  const pct=Math.round(loaded/total*100);
  barFill.style.width=pct+'%';
  loadTxt.textContent='加载中 '+pct+'%';
};

const loader=new GLTFLoader(loadingManager);

async function init(){
  const gltf=await loader.loadAsync('models/Model.glb');
  const model=gltf.scene;
  
  console.log('检测Group...');
  
  // 查找顶层Group
  model.children.forEach(child=>{
    if(child.type==='Group' && child.children.length>0){
      groups.push(child);
      console.log('  找到Group:', child.name || '(无名称)');
    }
  });
  
  // 如果不够3个，遍历查找
  if(groups.length<3){
    groups=[];
    const allGroups=[];
    model.traverse(child=>{
      if(child.type==='Group' && child.children.length>0){
        allGroups.push(child);
      }
    });
    allGroups.forEach(g=>{
      if(g.parent===model || g.parent===null){
        groups.push(g);
      }
    });
    console.log('  遍历找到', groups.length, '个顶层Group');
  }
  
  console.log('共找到', groups.length, '个Group');
  
  if(groups.length<3){
    console.warn('找到的Group少于3个，请检查模型结构');
  }
  
  model.traverse(child=>{
    if(child.isMesh){ child.castShadow=true; child.receiveShadow=true; }
  });
  
  scene.add(model);

  const box=new THREE.Box3().setFromObject(model);
  const size=box.getSize(new THREE.Vector3());
  const center=box.getCenter(new THREE.Vector3());
  maxDim=Math.max(size.x,size.y,size.z);
  const fov=camera.fov*Math.PI/180;
  const dist=(maxDim/2)/Math.tan(fov/2)*1.4;

  camera.position.set(center.x+dist*0.2,center.y+dist*0.15,center.z+dist);
  camera.lookAt(center);
  camera.near=maxDim*0.01; camera.far=maxDim*100;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.minDistance=dist*0.3; controls.maxDistance=dist*3;
  controls.update();

  dirLight.position.set(center.x+size.x*0.8,center.y+size.y*1.5,center.z+size.z*0.6);
  dirLight.target.position.copy(center);
  dirLight.shadow.camera.left=-maxDim; dirLight.shadow.camera.right=maxDim;
  dirLight.shadow.camera.top=maxDim; dirLight.shadow.camera.bottom=-maxDim;
  dirLight.shadow.camera.near=0.1; dirLight.shadow.camera.far=maxDim*5;
  dirLight.shadow.camera.updateProjectionMatrix();

  const ground=new THREE.Mesh(
    new THREE.PlaneGeometry(maxDim*10,maxDim*10),
    new THREE.ShadowMaterial({opacity:0.22})
  );
  ground.rotation.x=-Math.PI/2;
  ground.position.y=box.min.y;
  ground.receiveShadow=true;
  scene.add(ground);

  // 底部补光
  const bottomLight=new THREE.DirectionalLight(0xffffff,0.35);
  bottomLight.position.set(center.x, center.y-size.y*0.5, center.z);
  bottomLight.target.position.copy(center);
  scene.add(bottomLight);
  scene.add(bottomLight.target);
  
  modelCenter=center.clone();
  
  // 按Y坐标排序（从低到高）
  const sortedGroups=groups.map((g,i)=>({group:g, index:i})).sort((a,b)=>{
    const boxA=new THREE.Box3().setFromObject(a.group);
    const boxB=new THREE.Box3().setFromObject(b.group);
    return boxA.getCenter(new THREE.Vector3()).y - boxB.getCenter(new THREE.Vector3()).y;
  });
  
  groups=sortedGroups.map(item=>item.group);
  
  groups.forEach((group,idx)=>{
    const groupBox=new THREE.Box3().setFromObject(group);
    const groupCenter=groupBox.getCenter(new THREE.Vector3());
    
    const dir=groupCenter.sub(modelCenter).normalize();
    dir.y += 2.0;
    dir.normalize();
    
    const explodeDist=maxDim*(0.4 + idx*0.1);
    
    groupData.push({
      origPos:group.position.clone(),
      origScale:group.scale.clone(),
      explodeDir:dir,
      explodeDist:explodeDist
    });
    
    console.log('  Group', idx+1, '爆炸距离:', explodeDist.toFixed(2));
  });
  
  console.log('准备完成');
  
  for(let i=0;i<3;i++){
    const d=document.createElement('div');
    d.className='dot'+(i===0?' active':'');
    progress.appendChild(d);
  }
  
  updateUI();

  loading.classList.add('hide');
  enterMask.style.display='flex';
  animate();
}
init().catch(err=>{loadTxt.textContent='加载失败：'+err.message; console.error(err);});

function animate(){
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene,camera);
}

let entered=false;
enterMask.addEventListener('click',()=>{
  enterMask.classList.add('hide');
  entered=true;
  bgm.volume=0.2;
  bgm.play().catch(()=>{});
});

muteBtn.addEventListener('click',e=>{
  e.stopPropagation();
  if(bgm.paused){ bgm.play().catch(()=>{}); muteBtn.innerHTML='&#128266;'; }
  else{ bgm.pause(); muteBtn.innerHTML='&#128263;'; }
});

let pTime=0,pMoved=false;
canvas.addEventListener('pointerdown',e=>{pTime=Date.now();pMoved=false;});
canvas.addEventListener('pointermove',()=>{pMoved=true;});
canvas.addEventListener('pointerup',e=>{
  if(!entered || isAnimating) return;
  if(Date.now()-pTime<300&&!pMoved) handleClick();
});

function handleClick(){
  if(currentStep===0){
    riseGroup(0);
  }else if(currentStep>0 && currentStep<=3){
    fallGroup(currentStep-1);
  }
}

function riseGroup(groupIndex){
  isAnimating=true;
  currentStep=groupIndex+1;
  const wasRotating=controls.autoRotate;
  controls.autoRotate=false;
  
  titleBar.classList.add('hide');
  tip.textContent='第'+(groupIndex+1)+'组升起中...';
  
  const group=groups[groupIndex];
  const data=groupData[groupIndex];
  
  const duration=1000;
  const startTime=performance.now();
  
  function tick(){
    const elapsed=performance.now()-startTime;
    const t=Math.min(elapsed/duration,1);
    const eased=1-Math.pow(1-t,3);
    
    const targetPos=data.origPos.clone()
      .add(data.explodeDir.clone().multiplyScalar(data.explodeDist*eased));
    
    group.position.copy(targetPos);
    
    const s=1+0.08*eased;
    group.scale.setScalar(s);
    
    if(t<1){
      requestAnimationFrame(tick);
    }else{
      isAnimating=false;
      updateUI();
      controls.autoRotate=wasRotating;
      titleBar.classList.remove('hide');
      
      if(groupIndex<2){
        tip.textContent='点击屏幕：收回第'+(groupIndex+1)+'组';
      }else{
        tip.textContent='点击屏幕：收回第3组（最后一组）';
      }
    }
  }
  tick();
}

function fallGroup(groupIndex){
  isAnimating=true;
  const wasRotating=controls.autoRotate;
  controls.autoRotate=false;
  
  titleBar.classList.add('hide');
  tip.textContent='第'+(groupIndex+1)+'组收回中...';
  
  const group=groups[groupIndex];
  const data=groupData[groupIndex];
  
  const duration=800;
  const startTime=performance.now();
  const startPos=group.position.clone();
  const startScale=new THREE.Vector3(group.scale.x,group.scale.y,group.scale.z);
  
  function tick(){
    const elapsed=performance.now()-startTime;
    const t=Math.min(elapsed/duration,1);
    const eased=t*t*t;
    
    group.position.lerpVectors(startPos, data.origPos, eased);
    
    const currentScale=new THREE.Vector3(group.scale.x,group.scale.y,group.scale.z);
    group.scale.lerpVectors(currentScale, data.origScale, eased);
    
    if(t<1){
      requestAnimationFrame(tick);
    }else{
      group.position.copy(data.origPos);
      group.scale.copy(data.origScale);
      
      isAnimating=false;
      currentStep=groupIndex;
      updateUI();
      controls.autoRotate=wasRotating;
      titleBar.classList.remove('hide');
      
      if(groupIndex===0){
        tip.textContent='点击屏幕：升起第1组';
      }else{
        tip.textContent='点击屏幕：升起第'+(groupIndex+1)+'组';
      }
    }
  }
  tick();
}

function updateUI(){
  titleMain.textContent='掇山如画 · 第'+currentStep+'步';
  titleSub.textContent='第 '+Math.min(currentStep,3)+' / 3 步';
  
  [...progress.children].forEach((d,i)=>{
    if(i<currentStep) d.className='dot done';
    else if(i===currentStep) d.className='dot active';
    else d.className='dot';
  });
}

window.addEventListener('resize',()=>{
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight);
});
</script>
</body>
</html>'''

with open('掇山如画/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('Done')
