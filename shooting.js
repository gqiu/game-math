// 数字射击练习模块
(function () {
  const field = document.getElementById("targetField");
  const input = document.getElementById("shotInput");
  const btn = document.getElementById("shotBtn");
  const msgEl = document.getElementById("shotMsg");
  const levelEl = document.getElementById("sLevel");
  const hitsEl = document.getElementById("sHits");
  const levelHitsEl = document.getElementById("sLevelHits");
  const totalEl = document.getElementById("sTotal");
  const timeEl = document.getElementById("sTime");
  const restartBtn = document.getElementById("restartBtn");
  const overlay = document.getElementById("shootingOverlay");
  const finalTimeEl = document.getElementById("finalTime");
  const overlayRestart = document.getElementById("overlayRestart");

  // 音效：已在 audio/ 目录放入实际文件
  const hitAudio = createAudio("audio/hit2.mp3");
  const missAudio = createAudio("audio/miss.mp3");
  const levelAudio = createAudio("audio/level.mp3");

  // 配置（改为计时 + 得分模式）
  const TARGET_COUNT = 5;
  const MAX_TIME = 60;        // 单局总时长 (秒)
  const LEVEL_TARGET = 10;    // 每级需要命中数
  totalEl.textContent = MAX_TIME + "s"; // HUD 显示总时长

  // 难度与升级：共 10 级，每命中 LEVEL_TARGET(=10) 次自动升级
  // 等级配置：提升操作数与最大取值范围，结果始终限制在 0~20
  function getConfig(level) {
    // 10 级划分：
    // 1-3级：2 个数字，最大 10
    // 4-6级：3 个数字，最大 20
    // 7-10级：4 个数字，最大 20
    if (level <= 3) return { operands: 2, maxNum: 10 };
    if (level <= 6) return { operands: 3, maxNum: 20 };
    return { operands: 4, maxNum: 20 };
  }

  // 状态
  let level = 1;        // 1~10
  let hits = 0;         // 总得分
  let levelHits = 0;    // 当前等级内命中数
  let startTime = null;
  let timerHandle = null;
  let finished = false;

  // 初始化（延后到常量定义之后）
  // spawnInitialTargets(); // moved below constants
  // updateHUD();

  // 二次可见性检测：600ms 后仍无任何 .target 则强制 emergencyTargets()
  setTimeout(() => {
    if (!document.querySelector(".target")) {
      console.warn("[shooting] 二次检测：无靶子，调用 emergencyTargets()");
      emergencyTargets();
    }
  }, 600);

  // 终极提示：1200ms 后仍无 .target 或 .emergency 则显示文字诊断
  setTimeout(() => {
    if (!document.querySelector(".target") && !document.querySelector(".target.emergency")) {
      console.error("[shooting] 终极检测失败：脚本可能未执行或被缓存。");
      const diag = document.createElement("div");
      diag.style.position = "fixed";
      diag.style.top = "30%";
      diag.style.left = "50%";
      diag.style.transform = "translateX(-50%)";
      diag.style.background = "#ffeded";
      diag.style.color = "#ff3b3b";
      diag.style.padding = "18px 26px";
      diag.style.fontSize = "18px";
      diag.style.fontWeight = "700";
      diag.style.border = "3px solid #ff3b3b";
      diag.style.borderRadius = "12px";
      diag.style.zIndex = "10000";
      diag.textContent = "靶子脚本未运行：请按 Ctrl+F5 强制刷新或检查控制台错误。";
      document.body.appendChild(diag);
    }
  }, 1200);

  // 输入事件
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") fire();
  });
  btn.addEventListener("click", fire);
  restartBtn.addEventListener("click", resetGame);
  overlayRestart.addEventListener("click", resetGame);

  // 禁止滚轮改变
  input.addEventListener("wheel", e => e.preventDefault(), { passive: false });

  setTimeout(() => input.focus(), 400);

  // 随机定位参数（面直径、向下附加杆与底座总高度、边距）
  const FACE_SIZE = 120;
  const EXTRA_DOWN = 0; // 去掉靶杆与底座后不再需要向下预留空间
  const MARGIN = 12;
  // Debug: 强制可见模式（添加描边、固定位置），看不到靶子时自动启用
  const FORCE_DEBUG = false; // 关闭调试强制行布局
  const SIMPLE_MODE = false; // 关闭简化模式启用立体远近 + 高低位置
  const EMERGENCY_DELAY = 300; // 毫秒后仍看不到靶子则强制插入

  // 常量已定义，执行初始生成与 HUD 更新
  spawnInitialTargets();
  updateHUD();
  function emergencyTargets() {
    if (document.querySelector(".target.emergency")) return;
    for (let i = 0; i < 4; i++) {
      const d = document.createElement("div");
      d.className = "target emergency";
      d.textContent = (i+1) + "+1=?";
      d.style.position = "fixed";
      d.style.left = (20 + i*18) + "vw";
      d.style.top = "15vh";
      d.style.width = "120px";
      d.style.height = "120px";
      d.style.border = "6px solid #ff3b3b";
      d.style.borderRadius = "50%";
      d.style.background = "#fff";
      d.style.display = "flex";
      d.style.alignItems = "center";
      d.style.justifyContent = "center";
      d.style.fontSize = "36px";
      d.style.fontWeight = "700";
      d.style.zIndex = "9999";
      d.style.boxShadow = "0 0 18px rgba(255,0,0,.55)";
      document.body.appendChild(d);
    }
    setMessage("已强制显示紧急靶子 (emergency)", "bad");
    console.warn("[shooting] Emergency targets injected.");
  }

  function spawnInitialTargets() {
    field.innerHTML = "";
    if (FORCE_DEBUG) {
      field.style.display = "flex";
      field.style.flexWrap = "wrap";
      field.style.justifyContent = "center";
      field.style.alignItems = "flex-end";
    }
    for (let i = 0; i < TARGET_COUNT; i++) {
      field.appendChild(createTarget());
    }
    if (FORCE_DEBUG) {
      // 若简化/调试模式仍未显示则快速检测并强制注入
      setTimeout(() => {
        const hasAny = field.querySelector(".target");
        const emergencyAlready = document.querySelector(".target.emergency");
        if (!hasAny && !emergencyAlready) {
          console.warn("[shooting] FORCE_DEBUG 启用但未发现靶子，执行 emergencyTargets()");
          emergencyTargets();
        }
      }, EMERGENCY_DELAY);
      return;
    }
    // 调试：500ms 后检测显示情况；不可见或不存在则回退
    setTimeout(() => {
      const targets = Array.from(field.querySelectorAll(".target"));
      if (targets.length === 0) {
        console.warn("[shooting] 无靶子，执行回退生成。");
        fallbackTargets();
        return;
      }
      // 检测是否在容器可视区域内
      const fieldRect = field.getBoundingClientRect();
      let invisibleCount = 0;
      targets.forEach(t => {
        const r = t.getBoundingClientRect();
        const visible = r.bottom > fieldRect.top && r.top < fieldRect.bottom && r.right > fieldRect.left && r.left < fieldRect.right;
        if (!visible) invisibleCount++;
      });
      if (invisibleCount === targets.length) {
        console.warn("[shooting] 靶子全部不可见，执行回退简化显示。");
        fallbackTargets();
      } else if (invisibleCount > 0) {
        console.warn("[shooting] 部分靶子不可见(" + invisibleCount + "/" + targets.length + ")。");
      }
    }, 500);
  }

  function fallbackTargets() {
    field.innerHTML = "";
    setMessage("进入回退模式(简化靶子)", "bad");
    for (let i = 0; i < TARGET_COUNT; i++) {
      const t = document.createElement("div");
      t.className = "target fallback-target";
      t.style.position = "absolute";
      t.style.left = (10 + i * 20) + "%";
      t.style.bottom = "0px";
      t.style.width = "100px";
      t.style.height = "100px";
      t.style.border = "4px solid #6a5acd";
      t.style.borderRadius = "50%";
      t.style.background = "#fff";
      t.style.display = "flex";
      t.style.alignItems = "center";
      t.style.justifyContent = "center";
      t.style.fontWeight = "700";
      t.style.fontSize = "30px";
      t.style.zIndex = "10";
      const { expr, answer } = generateExpression();
      t.textContent = expr;
      t.dataset.answer = answer;
      if (FORCE_DEBUG) {
        t.style.outline = "3px dashed #ff3b3b";
        t.style.background = "#fff7e0";
      }
      field.appendChild(t);
    }
    // 再次检测若仍失败提示用户检查控制台错误
    setTimeout(() => {
      if (!field.querySelector(".target")) {
        console.error("[shooting] 回退仍失败，请检查控制台错误。");
        setMessage("靶子加载失败，请打开控制台查看错误", "bad");
      }
    }, 500);
  }

  function createTarget() {
    const { expr, answer, len } = generateExpression();

    if (SIMPLE_MODE) {
      const t = document.createElement("div");
      t.className = "target simple-target";
      t.dataset.answer = answer;
      t.dataset.len = len;
      t.textContent = expr;
      t.style.position = "static";
      t.style.margin = "14px 10px";
      return t;
    }

    const target = document.createElement("div");
    target.className = "target";
    target.dataset.answer = answer;
    target.dataset.len = len;

    // 非重叠随机定位算法
    const existing = Array.from(field.querySelectorAll(".target"));
    const fieldRect = field.getBoundingClientRect();
    const availableW = fieldRect.width;
    const availableH = fieldRect.height;
    // 计算可放置区域（需预留底座向下延伸 EXTRA_DOWN）
    const maxLeft = Math.max(MARGIN, availableW - FACE_SIZE - MARGIN);
    const maxTop = Math.max(MARGIN, availableH - (FACE_SIZE + EXTRA_DOWN) - MARGIN);
    const minDist = FACE_SIZE + 18; // 中心间最小距离，防止重叠/严重贴边
    let left = MARGIN, top = MARGIN;

    for (let attempt = 0; attempt < 60; attempt++) {
      left = randInt(MARGIN, Math.round(maxLeft));
      top = randInt(MARGIN, Math.round(maxTop));

      const cx = left + FACE_SIZE / 2;
      const cy = top + FACE_SIZE / 2;

      const overlap = existing.some(el => {
        const elLeft = parseFloat(el.style.left);
        const elTop = parseFloat(el.style.top);
        if (Number.isNaN(elLeft) || Number.isNaN(elTop)) return false;
        const ex = elLeft + FACE_SIZE / 2;
        const ey = elTop + FACE_SIZE / 2;
        return Math.hypot(cx - ex, cy - ey) < minDist;
      });

      if (!overlap) break;
      // 最后一次仍重叠则接受，保证生成不中断
      if (attempt === 59) console.warn("[shooting] 随机定位重试耗尽，接受可能重叠位置");
    }

    target.style.left = left + "px";
    target.style.top = top + "px";

    if (FORCE_DEBUG) {
      target.style.outline = "3px solid #ff3b3b";
      target.style.background = "#ffffff";
      target.style.zIndex = "20";
      target.style.position = "static";
      target.style.left = "";
      target.style.top = "";
      target.style.margin = "16px 12px";
    }

    // 结构: 面（已移除靶杆与底座）
    const face = document.createElement("div");
    face.className = "target-face";
    face.textContent = expr;
    target.appendChild(face);
    return target;
  }

  function generateExpression() {
    const cfg = getConfig(level);
    let attempt = 0;
    while (attempt < 200) {
      const nums = [];
      for (let i = 0; i < cfg.operands; i++) nums.push(randInt(0, cfg.maxNum));
      const ops = [];
      for (let i = 0; i < cfg.operands - 1; i++) ops.push(Math.random() < 0.5 ? "+" : "-");
      let total = nums[0];
      for (let i = 1; i < nums.length; i++) {
        total = ops[i - 1] === "+" ? total + nums[i] : total - nums[i];
      }
      if (total >= 0 && total <= 20) {
        let expr = "" + nums[0];
        for (let i = 1; i < nums.length; i++) expr += ops[i - 1] + nums[i];
        return { expr, answer: total, len: cfg.operands };
      }
      attempt++;
    }
    const a = randInt(0, 10);
    const b = randInt(0, 10);
    const op = Math.random() < 0.5 ? "+" : "-";
    const ans = op === "+" ? a + b : a - b;
    return { expr: `${a}${op}${b}`, answer: ans, len: 2 };
  }

  function fire() {
    if (finished) return;
    const value = input.value.trim();
    if (value === "") return;
    const ans = Number(value);
    if (Number.isNaN(ans)) return;
    input.value = "";

    // 找到首个匹配靶子
    const targets = Array.from(field.querySelectorAll(".target"));
    const target = targets.find(t => Number(t.dataset.answer) === ans);
    if (!target) {
      setMessage("答错", "bad");
      play(missAudio);
      return;
    }

    // 启动计时
    if (!startTime) {
      startTime = performance.now();
      timerHandle = setInterval(updateTime, 100);
    }

    shootArrow(target, ans);
  }

  function shootArrow(target, ans) {
    // 箭从输入区域上方中心飞向靶子
    const arrow = document.createElement("div");
    arrow.className = "arrow";
    document.body.appendChild(arrow);

    const inputRect = input.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    const startX = inputRect.left + inputRect.width / 2;
    const startY = inputRect.top;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    arrow.style.left = startX + "px";
    arrow.style.top = startY + "px";

    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy);
    const speed = 0.9; // px per ms
    const duration = Math.max(250, Math.min(900, distance / speed));

    arrow.style.transition = `transform ${duration}ms linear`;
    requestAnimationFrame(() => {
      arrow.style.transform = `translate(${dx}px, ${dy}px) rotate(${Math.atan2(dy, dx)}rad)`;
    });

    arrow.addEventListener("transitionend", () => {
      arrow.remove();
      // 命中后靶子落下
      target.classList.add("fall");
      setTimeout(() => {
        target.remove();
        field.appendChild(createTarget());
      }, 420);

      hits += 1;
      play(hitAudio);
      setMessage("命中 +1", "good");

      // 升级检测（每级需命中 LEVEL_TARGET 次，最高 10 级）
      levelHits += 1;
      if (level < 10 && levelHits >= LEVEL_TARGET) {
        level += 1;
        levelHits = 0;
        play(levelAudio);
        setMessage("升级 Level " + level, "level");
      }

      updateHUD();
      checkFinish();
    });
  }

  function updateHUD() {
    levelEl.textContent = level;
    hitsEl.textContent = hits;
    if (levelHitsEl) levelHitsEl.textContent = levelHits;
  }

  function updateTime() {
    if (!startTime || finished) return;
    const now = performance.now();
    const elapsed = (now - startTime) / 1000;
    const remaining = Math.max(0, MAX_TIME - elapsed);
    timeEl.textContent = remaining.toFixed(1) + "s";
    if (remaining <= 0) {
      finished = true;
      clearInterval(timerHandle);
      finalizeGame();
    }
  }

  function checkFinish() {
    // 计时制：不在此结束，由 updateTime 处理时间到期
  }

  function finalizeGame() {
    finalTimeEl.textContent = hits + " 分";
    overlay.classList.remove("hidden");
  }

  function resetGame() {
    clearInterval(timerHandle);
    finished = false;
    level = 1;
    hits = 0;
    levelHits = 0;
    startTime = null;
    timeEl.textContent = MAX_TIME + ".0s";
    overlay.classList.add("hidden");
    spawnInitialTargets();
    updateHUD();
    setMessage("", "");
    input.focus();
  }

  function setMessage(msg, type) {
    msgEl.textContent = msg;
    msgEl.className = "shot-msg " + (type || "");
    if (msg) {
      setTimeout(() => {
        if (msgEl.textContent === msg) {
          msgEl.className = "shot-msg";
        }
      }, 1500);
    }
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function createAudio(src) {
    const a = document.createElement("audio");
    a.src = src;
    a.preload = "auto";
    a.volume = 0.6;
    return a;
  }

  function play(a) {
    try {
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {}
  }
})();
