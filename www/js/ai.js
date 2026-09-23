/* ai.js —— AI 接口抽象层（OpenAI 兼容 chat/completions） */
(function () {
  'use strict';

  /* 组装学习状态分析 prompt（只发送聚合统计，不含原始记录） */
  function buildPrompt(summary) {
    const lines = [];
    lines.push('以下是一名用户的学习统计摘要，请作为学习教练进行分析：');
    lines.push('- 累计专注总时长：' + summary.totalHuman + '（' + summary.totalMinutes + ' 分钟）');
    lines.push('- 今日专注：' + summary.todayHuman);
    lines.push('- 连续专注天数：' + summary.streakDays + ' 天');
    lines.push('- 每日目标：' + summary.dailyGoal + ' 分钟，今日完成度 ' + summary.todayPercent + '%');
    lines.push('- 近 7 天日均：' + summary.avg7Human + '，近 30 天日均：' + summary.avg30Human);
    if (summary.bySubject && summary.bySubject.length) {
      lines.push('- 各科目时长分布：' + summary.bySubject.map(function (s) {
        return s.name + ' ' + s.human + '（' + s.percent + '%）';
      }).join('；'));
    }
    if (summary.weekTrend && summary.weekTrend.length) {
      lines.push('- 近 7 天逐日时长（分钟）：' + summary.weekTrend.map(function (d) { return d.minutes; }).join(', '));
    }
    lines.push('');
    lines.push('请用简洁、友好、鼓励性的中文，给出：1) 学习状态总体评价；2) 时间分配是否均衡；3) 2-3 条可落地的改进建议。控制在 200 字以内，使用分点。');
    return lines.join('\n');
  }

  async function analyze(summary) {
    const ai = Store.getData().settings.ai;
    if (!ai || !ai.endpoint) {
      throw new Error('请先在“设置”中填写 AI 接口地址');
    }
    if (!ai.enabled) {
      throw new Error('AI 分析未启用，请在“设置”中打开开关');
    }

    const headers = { 'Content-Type': 'application/json' };
    if (ai.apiKey) headers['Authorization'] = 'Bearer ' + ai.apiKey;

    const body = {
      model: ai.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是一名专业、温和的学习教练。' },
        { role: 'user', content: buildPrompt(summary) }
      ],
      temperature: 0.6,
      stream: false
    };

    const resp = await fetch(ai.endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.text()).slice(0, 200); } catch (e) {}
      throw new Error('接口返回错误 ' + resp.status + (detail ? '：' + detail : ''));
    }

    const json = await resp.json();
    const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (!content) throw new Error('接口未返回有效内容');
    return content;
  }

  /* 根据 provider 预设 endpoint / model */
  function presets() {
    return {
      deepseek: { endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
      openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
      ollama: { endpoint: 'http://localhost:11434/v1/chat/completions', model: 'qwen2.5:7b' },
      custom: { endpoint: '', model: '' }
    };
  }

  const AI = { analyze: analyze, buildPrompt: buildPrompt, presets: presets };
  window.AI = AI;
})();
