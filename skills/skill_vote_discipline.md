---
name: "投票纪律"
description: "使用 expert_vote / inspector_vote 进行交锋结果投票的时机与理由要求"
---

# 投票纪律

## 工具

```text
expert_vote(vote, reason)      // 非阻塞
inspector_vote(vote, reason)   // 非阻塞
```

- `vote` 取值：`"pass"` / `"reject"`
- `reason` 必填（即使 pass）
- 非阻塞：调用后立刻返回，继续等待后续消息

## 何时投票

### 规划阶段

- 经过若干轮方案 ↔ 审查迭代后
- 若你认为当前方案已成熟 → `pass`
- 若对方的提交/反馈质量不达标 → `reject`
- 双方投票 `pass` 会触发 CEO 规划门控

### 执行阶段

- 所有 Phase 已完成且审查通过后
- 若整体产出达标 → `pass`
- 若仍有遗留问题 → `reject`
- 双方投票 `pass` 会触发 CEO 终审

## 理由要求

`reason` 字段应写明：

- 投 `pass` 的依据（哪些关键点已满足）
- 投 `reject` 的依据（哪些关键点尚未满足）

避免空泛：`"ok"` / `"看起来不错"` / `"有问题"` 都不合格。

## 策略建议

- 不要为了尽快结束而早投 `pass`
- 不要为了严苛而永远 `reject`
- 方案合理进步时（即使未完全满足最初建议）应当认可
- 一旦投了 `pass`，后续除非出现新问题，不应再 `reject`
