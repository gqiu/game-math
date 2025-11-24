// 数学炮弹乐园核心逻辑
(function () {
  const playfield = document.getElementById("playfield");
  const answerInput = document.getElementById("answerInput");
  const fireBtn = document.getElementById("fireBtn");
  const levelEl = document.getElementById("level");
  const scoreEl = document.getElementById("score");
  const targetEl = document.getElementById("target");
  const livesEl = document.getElementById("lives");
  const messageEl = document.getElementById("message");

  // 游戏状态
  let level = 1;
  let score = 0;
  let destroyedThisLevel = 0;
  let targetPerLevel = 10;
  let lives = 10;
  let spawnTimer = null;
  let formulas = new Set();
  let gameOver = false;
  let win = false;

  // 参数配置
  // 难度重新设计: 前10级保持 2 个数字并且节奏较慢，11~15 使用 3 个数字，16~20 使用 4 个数字，逐步加快
  const levelConfig = {
    1:  { operands: 2, maxNum: 10, minDuration: 13000, maxDuration: 15500, spawnInterval: 3400 },
    2:  { operands: 2, maxNum: 10, minDuration: 12800, maxDuration: 15200, spawnInterval: 3300 },
    3:  { operands: 2, maxNum: 12, minDuration: 12500, maxDuration: 14900, spawnInterval: 3250 },
    4:  { operands: 2, maxNum: 12, minDuration: 12200, maxDuration: 14600, spawnInterval: 3200 },
    5:  { operands: 2, maxNum: 14, minDuration: 11900, maxDuration: 14300, spawnInterval: 3150 },
    6:  { operands: 2, maxNum: 14, minDuration: 11600, maxDuration: 14000, spawnInterval: 3100 },
    7:  { operands: 2, maxNum: 16, minDuration: 11300, maxDuration: 13700, spawnInterval: 3050 },
    8:  { operands: 2, maxNum: 16, minDuration: 11000, maxDuration: 13400, spawnInterval: 3000 },
    9:  { operands: 2, maxNum: 18, minDuration: 10700, maxDuration: 13100, spawnInterval: 2950 },
    10: { operands: 2, maxNum: 18, minDuration: 10400, maxDuration: 12800, spawnInterval: 2900 },
    11: { operands: 3, maxNum: 18, minDuration: 9800,  maxDuration: 12200, spawnInterval: 2700 },
    12: { operands: 3, maxNum: 18, minDuration: 9400,  maxDuration: 11800, spawnInterval: 2600 },
    13: { operands: 3, maxNum: 20, minDuration: 9000,  maxDuration: 11400, spawnInterval: 2500 },
    14: { operands: 3, maxNum: 20, minDuration: 8600,  maxDuration: 11000, spawnInterval: 2400 },
    15: { operands: 3, maxNum: 20, minDuration: 8200,  maxDuration: 10600, spawnInterval: 2300 },
    16: { operands: 4, maxNum: 20, minDuration: 7800,  maxDuration: 10200, spawnInterval: 2150 },
    17: { operands: 4, maxNum: 20, minDuration: 7400,  maxDuration: 9800,  spawnInterval: 2050 },
    18: { operands: 4, maxNum: 20, minDuration: 7000,  maxDuration: 9400,  spawnInterval: 1950 },
    19: { operands: 4, maxNum: 20, minDuration: 6600,  maxDuration: 9000,  spawnInterval: 1850 },
    20: { operands: 4, maxNum: 20, minDuration: 6200,  maxDuration: 8600,  spawnInterval: 1750 }
  };
  const maxLevel = 20;

  // 初始化
  renderLives();
  updateHUD();
  startSpawning();

  // 生成题目
  function generateExpression() {
    const cfg = levelConfig[level];
    const count = cfg.operands;
    const maxNum = cfg.maxNum;
    let attempt = 0;
    while (attempt < 200) {
      const nums = [];
      for (let i = 0; i < count; i++) nums.push(randInt(0, maxNum));
      const ops = [];
      for (let i = 0; i < count - 1; i++) ops.push(Math.random() < 0.5 ? "+" : "-");

      // 计算结果
      let total = nums[0];
      for (let i = 1; i < nums.length; i++) {
        total = ops[i - 1] === "+" ? total + nums[i] : total - nums[i];
      }
      if (total >= 0 && total <= 20) {
        // 表达式字符串
        let expr = "" + nums[0];
        for (let i = 1; i < nums.length; i++) {
          expr += ops[i - 1] + nums[i];
        }
        return { expr, answer: total, len: count };
      }
      attempt++;
    }
    // 降级保证永远生成
    const a = randInt(0, 10);
    const b = randInt(0, 10);
    const op = Math.random() < 0.5 ? "+" : "-";
    const ans = op === "+" ? a + b : a - b;
    return { expr: `${a}${op}${b}`, answer: ans, len: 2 };
  }

  // 创建落下公式元素
  function spawnFormula() {
    if (gameOver || win) return;
    const { expr, answer, len } = generateExpression();
    const el = document.createElement("div");
    el.className = "formula";
    el.textContent = expr;
    el.dataset.answer = answer;
    el.dataset.len = len;

    const cfg = levelConfig[level];
    const duration = randInt(cfg.minDuration, cfg.maxDuration);
    el.style.left = randInt(5, 85) + "%";
    el.style.animationDuration = duration + "ms";

    // 落地事件 (动画结束)
    el.addEventListener("animationend", () => {
      if (!el.classList.contains("explode")) {
        // 落地扣生命
        loseLife(el);
      }
    });

    playfield.appendChild(el);
    formulas.add(el);
  }

  // 发射炮弹
  function fire() {
    if (gameOver || win) return;
    const value = answerInput.value.trim();
    if (value === "") return;
    const answer = Number(value);
    if (Number.isNaN(answer)) return;

    answerInput.value = "";
    spawnBullet(answer);
  }

  // 子弹视觉与匹配
  // 改进版: 子弹视觉上真正到达公式中心再爆炸
  function spawnBullet(answer) {
    if (gameOver || win) return;

    // 找到最靠下的匹配公式 (命中优先)
    let targetFormula = null;
    let maxTop = -Infinity;
    formulas.forEach(f => {
      if (Number(f.dataset.answer) === answer && !f.classList.contains("explode")) {
        const top = f.getBoundingClientRect().top;
        if (top > maxTop) {
          maxTop = top;
          targetFormula = f;
        }
      }
    });

    // 没有匹配题目 => 答错
    if (!targetFormula) {
      setMessage("答错了!", "bad");
      return;
    }

    const playRect = playfield.getBoundingClientRect();
    const bullet = document.createElement("div");
    bullet.className = "bullet";
    bullet.style.bottom = "0px";
    bullet.style.animation = "none"; // 禁用原有 CSS 动画，改用 JS 控制
    playfield.appendChild(bullet);

    // 初始水平位置对齐公式中心
    function updateBulletX() {
      const fRect = targetFormula.getBoundingClientRect();
      const centerX = fRect.left - playRect.left + fRect.width / 2 - 7; // 7 = 半径
      bullet.style.left = centerX + "px";
    }
    updateBulletX();

    let bulletY = 0;
    // 速度与等级关联，稍微降低基础速度便于观察命中
    // 子弹速度调整: 前10级缓慢递增, 后面加快但不暴涨
    const speed = level <= 10
      ? 7 + Math.round(level * 0.4)         // 7 ~ 11
      : 11 + Math.round((level - 10) * 0.9); // 11 ~ 20 之间慢增

    // 优化: 减少频繁 getBoundingClientRect 次数 (每隔2帧检测), 使用 translate3d 提升性能
    let frameCount = 0;
    let lastBulletRect = null;
    let lastFormulaRect = null;

    function step() {
      if (gameOver || win) {
        bullet.remove();
        return;
      }
      if (!targetFormula || targetFormula.classList.contains("explode")) {
        bullet.remove();
        return;
      }

      bulletY += speed;
      bullet.style.transform = "translate3d(0," + (-bulletY) + "px,0)";

      // 每 2 帧做一次布局读取，减少卡顿
      if ((frameCount & 1) === 0) {
        lastBulletRect = bullet.getBoundingClientRect();
        lastFormulaRect = targetFormula.getBoundingClientRect();

        const bulletCenterY = lastBulletRect.top + lastBulletRect.height / 2;
        const formulaCenterY = lastFormulaRect.top + lastFormulaRect.height / 2;

        if (bulletCenterY <= formulaCenterY) {
          destroyFormula(targetFormula);
          bullet.remove();
          return;
        }

        // 超出上边界安全清理
        if (lastBulletRect.bottom < playRect.top - 60) {
          bullet.remove();
          return;
        }
      }

      frameCount++;
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // 消灭公式
  function destroyFormula(el) {
    if (!formulas.has(el)) return;

    // 使用元素在容器内的当前绝对位置固定，避免命中后在顶部闪现边缘
    const playRect = playfield.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const fixedTop = rect.top - playRect.top;
    const fixedLeft = rect.left - playRect.left;

    // 清除动画与 transform，改为固定定位
    el.style.animation = "none";
    el.style.transform = "none";
    el.style.top = fixedTop + "px";
    el.style.left = fixedLeft + "px";
    el.style.willChange = "transform, opacity";

    // 爆炸动画: 仅使用 scale/rotate/opacity，避免 translateY 产生位置抖动
    const duration = 420;
    const start = performance.now();
    function explodeStep(now) {
      const t = Math.min(1, (now - start) / duration);
      // easeOutQuad
      const ease = 1 - (1 - t) * (1 - t);
      const scale = 1 - ease * 0.9; // 1 -> 0.1
      const rotate = -40 * ease;
      const opacity = 1 - ease;
      el.style.transform = "scale(" + scale + ") rotate(" + rotate + "deg)";
      el.style.opacity = opacity;
      if (t < 1) {
        requestAnimationFrame(explodeStep);
      } else {
        el.remove();
      }
    }
    requestAnimationFrame(explodeStep);

    formulas.delete(el);
    score += 1;
    destroyedThisLevel += 1;
    updateHUD();
    setMessage("命中 +1", "good");
    checkLevelProgress();
  }

  // 落地扣生命
  function loseLife(el) {
    if (!formulas.has(el)) return;
    formulas.delete(el);
    el.remove();
    lives -= 1;
    renderLives();
    setMessage("落地 -1", "bad");
    if (lives <= 0) {
      endGame(false);
    }
  }

  // 检查升级 / 通关
  function checkLevelProgress() {
    if (destroyedThisLevel >= targetPerLevel) {
      level += 1;
      if (level > maxLevel) {
        endGame(true);
        return;
      }
      destroyedThisLevel = 0;
      levelEl.textContent = level;
      setMessage("升级！等级 " + level + "/" + maxLevel, "level");
      restartSpawning();
    }
  }

  // 结束游戏
  function endGame(won) {
    gameOver = !won;
    win = won;
    clearInterval(spawnTimer);
    showBanner(won);
  }

  // 显示胜利或失败遮罩
  function showBanner(won) {
    const banner = document.createElement("div");
    banner.className = won ? "win-banner" : "game-over-banner";
    banner.innerHTML = `
      <div>${won ? "🎉 胜利！" : "游戏结束"}</div>
      <div style="font-size:clamp(16px,3vw,26px);font-weight:500;">
        得分: ${score}
      </div>
      <button class="banner-btn" id="restartBtn">${won ? "再玩一次" : "重新开始"}</button>
    `;
    playfield.appendChild(banner);
    document.getElementById("restartBtn").addEventListener("click", resetGame);
  }

  // 重置游戏
  function resetGame() {
    // 清空状态
    formulas.forEach(f => f.remove());
    formulas.clear();
    gameOver = false;
    win = false;
    level = 1;
    score = 0;
    destroyedThisLevel = 0;
    lives = 10;
    messageEl.textContent = "";
    playfield.querySelectorAll(".game-over-banner,.win-banner").forEach(b => b.remove());
    renderLives();
    updateHUD();
    restartSpawning();
  }

  function restartSpawning() {
    clearInterval(spawnTimer);
    startSpawning();
  }

  function startSpawning() {
    const cfg = levelConfig[level];
    spawnTimer = setInterval(spawnFormula, cfg.spawnInterval);
    // 立即生成一个
    spawnFormula();
  }

  function updateHUD() {
    levelEl.textContent = level;
    scoreEl.textContent = score;
    targetEl.textContent = targetPerLevel;
  }

  function renderLives() {
    livesEl.innerHTML = "";
    for (let i = 0; i < lives; i++) {
      const heart = document.createElement("span");
      heart.className = "heart";
      livesEl.appendChild(heart);
    }
  }

  function setMessage(msg, cls) {
    messageEl.textContent = msg;
    messageEl.className = "message " + (cls || "");
    setTimeout(() => {
      if (messageEl.textContent === msg) {
        messageEl.className = "message";
      }
    }, 1500);
  }

  // 工具函数
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // 输入事件
  answerInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      fire();
    }
  });

  fireBtn.addEventListener("click", fire);

  // 防止数值键盘滚动调整
  answerInput.addEventListener("wheel", e => e.preventDefault(), { passive: false });

  // 为移动端自动聚焦（安全起见延迟）
  setTimeout(() => {
    answerInput.focus();
  }, 500);
})();
