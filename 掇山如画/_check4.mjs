
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const titleBar=document.getElementById('titleBar'),
      titleSub=document.getElementById('titleSub'),
      tip=document.getElementById('tip'),
      loading=document.getElementById('loading'),
      loadTxt=document.getElementById('loadTxt'),
      barFill=document.getElementById('barFill'),
      enterMask=document.getElementById('enterMask'),
      bgm=document.getElementById('bgm'),
      muteBtn=document.getElementById('muteBtn'),
      progressDots=document.querySelectorAll('#progress .dot');

const canvas=document.getElementById('canvas');
const renderer=new THREE.WebGLRenderer({canvas, antialias:true, alpha:false});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x2a2a2a);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.shadowMap.radius=8;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=0.6;
renderer.outputColorSpace=THREE.SRGBColorSpace;

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 100000);

const pmrem=new THREE.PMREMGenerator(renderer);
scene.environment=pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const dirLight=new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.castShadow=true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.bias=-0.0005;
dirLight.shadow.radius=12;
dirLight.shadow.blurSamples=25;
scene.add(dirLight);
scene.add(dirLight.target);

const ambLight=new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambLight);

const controls=new OrbitControls(camera, canvas);
controls.enableDamping=true;
controls.dampingFactor=0.08;
controls.autoRotate=true;
controls.autoRotateSpeed=0.5;
controls.enablePan=true;
controls.screenSpacePanning=true;
controls.panSpeed=1.2;

// ── 加载管理器 ──
const loadingManager=new THREE.LoadingManager();
loadingManager.onProgress=(url, loaded, total)=>{
  const pct=Math.round(loaded/total*100);
  barFill.style.width=pct+'%';
  loadTxt.textContent='加载中 '+pct+'%';
};

const loader=new GLTFLoader(loadingManager);

// ── 状态机 ──
// 每组4个阶段: rise → explode → implode → fall
const PHASES=['上升', '散开', '收回', '下落'];
let groups=[];        // 3个Group对象
let groupData=[];     // 每个Group的动画数据
let currentGroup=0;   // 当前操作的Group索引 (0-2)
let currentPhase=0;   // 当前阶段 (0=上升, 1=散开, 2=收回, 3=下落)
let isAnimating=false;
let entered=false;
let maxDim=0;

async function init(){
  const gltf=await loader.loadAsync('models/Model.glb');
  const model=gltf.scene;

  // --- 修复玻璃/透明材质 ---
  model.traverse(child=>{
    if(!child.isMesh) return;
    child.castShadow=true;
    child.receiveShadow=true;
    const mat=child.material;
    if(!mat) return;
    const mats=Array.isArray(mat)?mat:[mat];
    mats.forEach(m=>{
      const name=(m.name||'').toLowerCase();
      if(name.includes('glass')||name.includes('透明')||name.includes('玻璃')||name.includes('window')){
        m.transparent=true;
        m.opacity=Math.min(m.opacity||1, 0.35);
        m.depthWrite=false;
        m.needsUpdate=true;
      }
    });
  });

  // --- 识别 Group1/2/3 ---
  groups=[];
  model.traverse(child=>{
    if(child.name && /^Group[123]$/.test(child.name)){
      groups.push(child);
    }
  });
  // 按 name 排序确保 Group1 < Group2 < Group3
  groups.sort((a,b)=>a.name.localeCompare(b.name));
  console.log('找到', groups.length, '个Group:', groups.map(g=>g.name).join(', '));

  // --- 为每个Group构建动画数据 ---
  groupData=groups.map(group=>{
    const gBox=new THREE.Box3().setFromObject(group);
    const gCenter=gBox.getCenter(new THREE.Vector3());
    const gSize=gBox.getSize(new THREE.Vector3());

    // 收集所有子Mesh（递归）
    const meshChildren=[];
    group.traverse(child=>{
      if(child.isMesh){
        meshChildren.push({
          object:child,
          origPos:child.position.clone(),
          origWorldPos:new THREE.Vector3().setFromMatrixPosition(child.matrixWorld)
        });
      }
    });

    return {
      origPos:group.position.clone(),
      origScale:group.scale.clone(),
      center:gCenter.clone(),
      size:gSize.clone(),
      riseDist:gSize.y * 1.5,           // 上升距离（组高度的1.5倍）
      meshChildren:meshChildren,
      explodeOffset:0                    // 散开偏移量（0=未散开）
    };
  });

  scene.add(model);
  setupCamera(model);

  loading.classList.add('hide');
  enterMask.style.display='flex';
  animate();
}
init().catch(err=>{ loadTxt.textContent='加载失败：'+err.message; console.error(err); });

function setupCamera(model){
  const box=new THREE.Box3().setFromObject(model);
  const size=box.getSize(new THREE.Vector3());
  const center=box.getCenter(new THREE.Vector3());
  maxDim=Math.max(size.x, size.y, size.z);
  const fov=camera.fov*Math.PI/180;
  const dist=(maxDim/2)/Math.tan(fov/2)*1.4;
  camera.position.set(center.x+dist*0.2, center.y+dist*0.15, center.z+dist);
  camera.lookAt(center);
  camera.near=maxDim*0.001; camera.far=maxDim*1000;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.minDistance=maxDim*0.05;
  controls.maxDistance=dist*8;
  controls.update();

  dirLight.position.set(center.x+size.x*0.8, center.y+size.y*1.5, center.z+size.z*0.6);
  dirLight.target.position.copy(center);
  dirLight.shadow.camera.left=-maxDim; dirLight.shadow.camera.right=maxDim;
  dirLight.shadow.camera.top=maxDim; dirLight.shadow.camera.bottom=-maxDim;
  dirLight.shadow.camera.near=0.1; dirLight.shadow.camera.far=maxDim*5;
  dirLight.shadow.camera.updateProjectionMatrix();

  const ground=new THREE.Mesh(
    new THREE.PlaneGeometry(maxDim*10, maxDim*10),
    new THREE.ShadowMaterial({opacity:0.22})
  );
  ground.rotation.x=-Math.PI/2;
  ground.position.y=box.min.y;
  ground.receiveShadow=true;
  scene.add(ground);

  const bottomLight=new THREE.DirectionalLight(0xffffff, 0.15);
  bottomLight.position.set(center.x, center.y-size.y*0.5, center.z);
  bottomLight.target.position.copy(center);
  scene.add(bottomLight);
  scene.add(bottomLight.target);
}

// ── 动画循环 ──
const clock=new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const delta=clock.getDelta();
  controls.update();
  renderer.render(scene, camera);
}

// ── 缓动函数 ──
function easeOutCubic(t){ return 1-Math.pow(1-t,3); }
function easeInCubic(t){ return t*t*t; }
function easeInOutCubic(t){ return t<0.5? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }

// ── 辅助：将世界空间向量转换到父级局部空间（3x3逆矩阵，不含平移）──
function toParentLocal(parent, worldVec){
  const m=parent.matrixWorld.elements;
  const det=m[0]*(m[5]*m[10]-m[6]*m[9]) - m[4]*(m[1]*m[10]-m[2]*m[9]) + m[8]*(m[1]*m[6]-m[2]*m[5]);
  const id=1/det;
  const inv=new THREE.Matrix4();
  const e=inv.elements;
  e[0]=(m[5]*m[10]-m[6]*m[9])*id; e[1]=(m[8]*m[9]-m[4]*m[10])*id; e[2]=(m[4]*m[6]-m[8]*m[5])*id;
  e[4]=(m[6]*m[8]-m[2]*m[10])*id; e[5]=(m[0]*m[10]-m[8]*m[2])*id; e[6]=(m[8]*m[1]-m[0]*m[6])*id;
  e[8]=(m[2]*m[9]-m[1]*m[8])*id;  e[9]=(m[4]*m[8]-m[0]*m[9])*id; e[10]=(m[0]*m[5]-m[4]*m[1])*id;
  e[3]=0; e[7]=0; e[11]=0; e[15]=1;
  return worldVec.clone().applyMatrix4(inv);
}

// ── 执行动画（通用）──
function runAnim(duration, onProgress, onComplete){
  isAnimating=true;
  const startTime=performance.now();
  function tick(){
    const elapsed=performance.now()-startTime;
    const t=Math.min(elapsed/duration, 1);
    onProgress(t);
    if(t<1){
      requestAnimationFrame(tick);
    }else{
      isAnimating=false;
      onComplete&&onComplete();
    }
  }
  tick();
}

// ── 阶段动画 ──
function doPhase(groupIdx, phase){
  const group=groups[groupIdx];
  const data=groupData[groupIdx];
  const wasRotating=controls.autoRotate;
  controls.autoRotate=false;
  titleBar.classList.add('hide');

  if(phase===0){
    // ▲ 上升
    const riseY=data.riseDist;
    runAnim(800, t=>{
      const e=easeOutCubic(t);
      group.position.y=data.origPos.y + riseY*e;
      group.scale.setScalar(1 + 0.03*e);
    }, ()=>{
      controls.autoRotate=wasRotating;
      titleBar.classList.remove('hide');
      updateTip('点击屏幕：第'+(groupIdx+1)+'组散开');
    });
  }
  else if(phase===1){
    // ✦ 散开 — 按组别采用不同策略
    const meshes=data.meshChildren;
    const explodeDist=maxDim*0.12;

    if(groupIdx===0){
      // ── Group1：白色构件斜上，绿色构件斜下 ──
      const dirs=meshes.map(mc=>{
        const col=mc.object.material?.color;
        const isWhite=col && col.getHex()===0xffffff;
        const dir=isWhite
          ? new THREE.Vector3(0.5, 0.8, 0.3).normalize()
          : new THREE.Vector3(-0.5, -0.6, -0.3).normalize();
        dir.x += (Math.random()-0.5)*0.3;
        dir.y += (Math.random()-0.5)*0.2;
        dir.z += (Math.random()-0.5)*0.3;
        dir.normalize();
        return dir.multiplyScalar(explodeDist);
      });
      const localOffsets=dirs.map((d, i)=>{
        const parent=meshes[i].object.parent;
        if(!parent || parent===group) return d.clone();
        return toParentLocal(parent, d);
      });
      runAnim(800, t=>{
        const e=easeOutCubic(t);
        meshes.forEach((mc, i)=>{
          mc.object.position.copy(mc.origPos).addScaledVector(localOffsets[i], e);
        });
      }, ()=>{ controls.autoRotate=wasRotating; titleBar.classList.remove('hide');
        updateTip('点击屏幕：第'+(groupIdx+1)+'组收回'); });

    } else if(groupIdx===2){
      // ── Group3：按顶层父级分组，组内不散开，组间分离 ──
      const topLevelParentMap=new Map();
      meshes.forEach(mc=>{
        let p=mc.object;
        while(p.parent && p.parent!==group) p=p.parent;
        topLevelParentMap.set(mc.object.uuid, p);
      });
      const parentGroups=new Map();
      meshes.forEach(mc=>{
        const tp=topLevelParentMap.get(mc.object.uuid);
        if(!parentGroups.has(tp.uuid)) parentGroups.set(tp.uuid, {obj:tp, meshes:[]});
        parentGroups.get(tp.uuid).meshes.push(mc);
      });
      const parents=[...parentGroups.values()];
      const parentOrigPos=parents.map(pg=>pg.obj.position.clone());
      const parentDirs=parents.map((pg, i)=>{
        const dir=i===0
          ? new THREE.Vector3(0.4, 0.7, 0.3).normalize()
          : new THREE.Vector3(-0.4, -0.5, -0.3).normalize();
        dir.x += (Math.random()-0.5)*0.2;
        dir.z += (Math.random()-0.5)*0.2;
        dir.normalize();
        return dir.multiplyScalar(explodeDist*1.5);
      });

      runAnim(800, t=>{
        const e=easeOutCubic(t);
        parents.forEach((pg, i)=>{
          pg.obj.position.copy(parentOrigPos[i]).addScaledVector(parentDirs[i], e);
        });
      }, ()=>{
        parents.forEach((pg, i)=>{
          pg.obj.userData.scatterPos=pg.obj.position.clone();
          pg.obj.userData.origPosInGroup=parentOrigPos[i];
        });
        controls.autoRotate=wasRotating; titleBar.classList.remove('hide');
        updateTip('点击屏幕：第'+(groupIdx+1)+'组收回');
      });

    } else {
      // ── Group2：保持当前随机散开 ──
      const groupWorldPos=new THREE.Vector3().setFromMatrixPosition(group.matrixWorld);
      const worldOffsets=meshes.map(mc=>{
        const mcWorld=new THREE.Vector3().setFromMatrixPosition(mc.object.matrixWorld);
        let dir=mcWorld.clone().sub(groupWorldPos);
        if(dir.length()<0.001) dir.set(Math.random()-0.5, 1, Math.random()-0.5);
        dir.normalize();
        dir.x += (Math.random()-0.5)*0.6;
        dir.y += (Math.random()-0.5)*0.4 + 0.15;
        dir.z += (Math.random()-0.5)*0.6;
        dir.normalize();
        return dir.multiplyScalar(explodeDist);
      });
      const localOffsets=worldOffsets.map((d, i)=>{
        const parent=meshes[i].object.parent;
        if(!parent || parent===group) return d.clone();
        return toParentLocal(parent, d);
      });
      runAnim(800, t=>{
        const e=easeOutCubic(t);
        meshes.forEach((mc, i)=>{
          mc.object.position.copy(mc.origPos).addScaledVector(localOffsets[i], e);
        });
      }, ()=>{ controls.autoRotate=wasRotating; titleBar.classList.remove('hide');
        updateTip('点击屏幕：第'+(groupIdx+1)+'组收回'); });
    }
  }
  else if(phase===2){
    // ◄ 收回
    const meshes=data.meshChildren;

    if(groupIdx===2){
      // ── Group3：恢复顶层父级位置（子构件跟随归位）──
      const topLevelParentMap=new Map();
      meshes.forEach(mc=>{
        let p=mc.object;
        while(p.parent && p.parent!==group) p=p.parent;
        topLevelParentMap.set(mc.object.uuid, p);
      });
      const parentGroups=new Map();
      meshes.forEach(mc=>{
        const tp=topLevelParentMap.get(mc.object.uuid);
        if(!parentGroups.has(tp.uuid)) parentGroups.set(tp.uuid, {obj:tp});
      });
      const parents=[...parentGroups.values()];
      const currentParentPos=parents.map(pg=>pg.obj.position.clone());
      const origParentPos=parents.map(pg=>pg.obj.userData.origPosInGroup || pg.obj.position.clone());

      runAnim(500, t=>{
        const e=easeInCubic(t);
        parents.forEach((pg, i)=>{
          pg.obj.position.lerpVectors(currentParentPos[i], origParentPos[i], e);
        });
      }, ()=>{
        parents.forEach((pg, i)=>{
          pg.obj.position.copy(origParentPos[i]);
        });
        controls.autoRotate=wasRotating;
        titleBar.classList.remove('hide');
        updateTip('点击屏幕：第'+(groupIdx+1)+'组下落');
      });
    } else {
      // ── Group1/2：恢复每个mesh的原始位置 ──
      const currentPositions=meshes.map(mc=>mc.object.position.clone());
      runAnim(500, t=>{
        const e=easeInCubic(t);
        meshes.forEach((mc, i)=>{
          mc.object.position.lerpVectors(currentPositions[i], mc.origPos, e);
        });
      }, ()=>{
        meshes.forEach(mc=>mc.object.position.copy(mc.origPos));
        controls.autoRotate=wasRotating;
        titleBar.classList.remove('hide');
        updateTip('点击屏幕：第'+(groupIdx+1)+'组下落');
      });
    }
  }
  else if(phase===3){
    // ▼ 下落
    const startY=group.position.y;
    const startScale=group.scale.x;
    runAnim(700, t=>{
      const e=easeInCubic(t);
      group.position.y=startY + (data.origPos.y-startY)*e;
      group.scale.setScalar(startScale + (1-startScale)*e);
    }, ()=>{
      // 精确归位
      group.position.copy(data.origPos);
      group.scale.copy(data.origScale);
      controls.autoRotate=wasRotating;
      titleBar.classList.remove('hide');

      // 进入下一组或循环
      currentGroup++;
      currentPhase=0;
      if(currentGroup>=groups.length){
        currentGroup=0;
        updateTip('点击屏幕：第1组上升（重新开始）');
        updateProgress(-1); // 全部完成
      }else{
        updateTip('点击屏幕：第'+(currentGroup+1)+'组上升');
        updateProgress(currentGroup-1);
      }
    });
  }
}

// ── 点击处理 ──
function handleClick(){
  if(!entered||isAnimating) return;

  if(currentPhase<4){
    const gName='第'+(currentGroup+1)+'组';
    titleSub.textContent=gName+' · '+PHASES[currentPhase]+'中…';
    tip.textContent=gName+PHASES[currentPhase]+'中…';

    doPhase(currentGroup, currentPhase);

    // 更新进度
    if(currentPhase===0) updateProgress(currentGroup);

    currentPhase++;
    if(currentPhase>3) currentPhase=0; // 会在 doPhase 的 onComplete 里更新 currentGroup
  }
}

function updateTip(text){
  tip.textContent=text;
  titleSub.textContent='第'+(currentGroup+1)+'组 / 共3组';
}

function updateProgress(doneIdx){
  progressDots.forEach((d, i)=>{
    if(doneIdx===-1){
      d.className='dot done';
    }else if(i<doneIdx+1 && i<=doneIdx){
      d.className='dot done';
    }else if(i===currentGroup){
      d.className='dot active';
    }else{
      d.className=i<currentGroup?'dot done':'dot';
    }
  });
}

// ── 点击进入 ──
enterMask.addEventListener('click', ()=>{
  enterMask.classList.add('hide');
  entered=true;
  bgm.volume=0.4;
  bgm.play().catch(()=>{});
});

// ── 点击检测（像素阈值）──
let downX=0, downY=0, downT=0;
canvas.addEventListener('pointerdown', e=>{
  downX=e.clientX; downY=e.clientY; downT=Date.now();
});
canvas.addEventListener('pointerup', e=>{
  const dx=Math.abs(e.clientX-downX);
  const dy=Math.abs(e.clientY-downY);
  if(dx<12 && dy<12 && Date.now()-downT<800){
    handleClick();
  }
});

muteBtn.addEventListener('click', e=>{
  e.stopPropagation();
  if(bgm.paused){ bgm.play().catch(()=>{}); muteBtn.textContent='\u{1F50A}'; }
  else{ bgm.pause(); muteBtn.textContent='\u{1F507}'; }
});

window.addEventListener('resize', ()=>{
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
