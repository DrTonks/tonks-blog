---
title: Codex高频写入SQLite日志问题与解决方案
published: 2026-07-23
description: 记录 Codex Desktop 的 logs_2.sqlite/WAL 高频写入问题，提供只读诊断、风险边界、SQLite trigger 缓解方案、验证数据与完整回滚流程。
tags:
  - Codex
  - SQLite
  - SSD
  - 性能优化
  - Windows
category: 常见问题
draft: false
pinned: false
image: ./1.png
---

最近检查 Codex 的本地数据时，我发现 `~/.codex/logs_2.sqlite` 正在持续写入大量 `TRACE`、`DEBUG` 和 `INFO` 日志。问题不只是数据库文件占用空间，高频 INSERT、WAL 刷新、旧记录清理和多进程共享数据库还可能带来额外磁盘 I/O 与 SQLite 竞争。

> 方案只拦截已确认高频的 `TRACE/DEBUG/INFO`，保留 `WARN/ERROR/FATAL/CRITICAL` 以及未来未知级别。
>
> 如果官方以后提供日志级别、采样或轮转设置，应优先使用官方方案。

## 测试时环境

| 项目 | 信息 |
|---|---|
| 检查日期 | 2026-07-23 |
| 操作系统 | Windows 11 x64 |
| Codex Desktop | `26.715.10079.0` |
| 内置 codex-cli | `0.145.0-alpha.30` |
| 日志数据库 | `%USERPROFILE%\.codex\logs_2.sqlite` |
| SQLite journal mode | WAL |

## 问题是什么？

在一次正常活跃会话中观察到：

| 指标 | 安装前 |
|---|---:|
| 最近 60 秒低级别日志 | 1,087 条 |
| 估算日志正文 | 约 3.9 MiB/分钟 |
| 主数据库 | 53.2 MiB |
| WAL | 约 4.6 MiB，持续刷新 |
| TRACE 累计正文 | 约 38.7 MiB |
| DEBUG 累计正文 | 约 1.5 MiB |
| INFO 累计正文 | 约 1.2 MiB |

其中 `codex_http_client::transport` 只有 168 行，却占约 35.1 MiB，说明少数体积很大的网络诊断日志是主要来源之一。

还有一个很有意思的信号：当时日志最大 ID 已超过 104 万，但表内只保留约 1.28 万行。这意味着系统曾发生大量“插入日志—清理旧记录”的循环。删除记录不会自动缩小 SQLite 主文件，反而会留下可复用空页，因此文件大小本身不能完整反映真实写入活动。

OpenAI Codex 的公开 issue [#24275](https://github.com/openai/codex/issues/24275) 也记录了类似现象：活跃会话中 `logs_2.sqlite-wal` 在几分钟内增长到约 146.6 MB，而 SQLite 中统计到的逻辑日志量只有约 2.4 MB。

**该 issue 在本文写作时仍为 Open。**

---

## 影响？

可能的实际影响包括：

1. **磁盘 I/O 增加**：日志正文、SQLite 页和 WAL frame 都会产生写入。
2. **写放大**：应用层正文大小不等于 WAL 写入量，更不等于 SSD 最终 NAND 写入量。
3. **数据库竞争**：多个 Codex/app-server 进程共享日志库时，频繁事务可能增加锁竞争。
4. **空间与清理开销**：旧记录删除、checkpoint 和空页复用仍会产生工作。
5. **诊断库膨胀**：即使历史行被删除，主数据库也可能因为空闲页而保持较大。

真实磨损还取决于 checkpoint、文件系统缓存、SSD 控制器、垃圾回收和写放大系数。本文能确认和解决的是：**Codex 是否在持续落盘大量低级别日志，以及如何减少这部分不必要的写入。**

## 诊断

下面的脚本只依赖 Python 标准库，提供：

- `status`：只读统计最近日志和数据库状态；
- `install`：先备份，再安装保守黑名单 trigger；
- `check`：只读检查 trigger 是否完整；
- `remove`：先备份，再恢复默认日志行为。

把下面代码保存为 `codex_log_guard.py`：

```python
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path

TRIGGER_NAME = "codex_drop_low_value_logs"
BLOCKED_LEVELS = ("TRACE", "DEBUG", "INFO")
KNOWN_TRIGGERS = (
    TRIGGER_NAME,
    "codex_keep_warn_error_logs",
    "block_noisy_logs",
    "codex_drop_trace_logs",
    "codex_drop_all_logs",
)
TRIGGER_SQL = f"""
CREATE TRIGGER {TRIGGER_NAME}
BEFORE INSERT ON logs
WHEN upper(coalesce(NEW.level, '')) IN ('TRACE', 'DEBUG', 'INFO')
BEGIN
    SELECT RAISE(IGNORE);
END
""".strip()

def fail(message: str) -> None:
    raise SystemExit(f"error: {message}")

def default_db() -> Path:
    override = os.environ.get("CODEX_LOG_DB")
    return Path(override).expanduser() if override else Path.home() / ".codex" / "logs_2.sqlite"

def connect(db: Path, readonly: bool) -> sqlite3.Connection:
    if not db.exists():
        fail(f"database not found: {db}")
    if readonly:
        con = sqlite3.connect(db.resolve().as_uri() + "?mode=ro", uri=True, timeout=30)
    else:
        con = sqlite3.connect(db, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA busy_timeout=30000")
    return con

def assert_schema(con: sqlite3.Connection) -> None:
    table = con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='logs'"
    ).fetchone()
    if not table:
        fail("logs table not found")
    columns = {row["name"] for row in con.execute("PRAGMA table_info(logs)")}
    missing = {"id", "ts", "level"} - columns
    if missing:
        fail(f"logs table missing columns: {', '.join(sorted(missing))}")

def normalized(sql: str) -> str:
    return re.sub(r"\s+", "", sql).rstrip(";").lower()

def trigger_ok(con: sqlite3.Connection) -> bool:
    row = con.execute(
        "SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?",
        (TRIGGER_NAME,),
    ).fetchone()
    return bool(row and normalized(row["sql"]) == normalized(TRIGGER_SQL))

def backup(db: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    target = db.parent / f"{db.name}.backup-{stamp}.sqlite"
    with sqlite3.connect(db, timeout=30) as src, sqlite3.connect(target) as dst:
        src.backup(dst)
    print(f"backup: {target} ({target.stat().st_size} bytes)")
    return target

def status(db: Path, seconds: int) -> None:
    with connect(db, readonly=True) as con:
        assert_schema(con)
        columns = {row["name"] for row in con.execute("PRAGMA table_info(logs)")}
        byte_expr = (
            "coalesce(sum(estimated_bytes), 0)"
            if "estimated_bytes" in columns
            else "0"
        )
        rows = con.execute(
            f"""
            SELECT upper(level) AS level, count(*) AS rows,
                   coalesce(max(id), 0) AS max_id, {byte_expr} AS bytes
            FROM logs
            WHERE ts >= ?
            GROUP BY upper(level)
            ORDER BY rows DESC
            """,
            (int(time.time()) - seconds,),
        ).fetchall()
        page_size = int(con.execute("PRAGMA page_size").fetchone()[0])
        free_pages = int(con.execute("PRAGMA freelist_count").fetchone()[0])

        print(f"database: {db} ({db.stat().st_size} bytes)")
        wal = Path(str(db) + "-wal")
        print(f"wal: {wal.stat().st_size if wal.exists() else 0} bytes")
        print(f"trigger: {'OK' if trigger_ok(con) else 'MISSING/OUTDATED'}")
        print(f"reclaimable after VACUUM: {page_size * free_pages} bytes")
        print(f"recent {seconds}s:")
        if not rows:
            print("  no rows")
        for row in rows:
            print(
                f"  {row['level']}: rows={row['rows']} "
                f"max_id={row['max_id']} bytes={row['bytes']}"
            )

def install(db: Path) -> None:
    backup(db)
    with connect(db, readonly=False) as con:
        assert_schema(con)
        for name in KNOWN_TRIGGERS:
            con.execute(f"DROP TRIGGER IF EXISTS {name}")
        con.execute(TRIGGER_SQL)
        con.commit()
        if not trigger_ok(con):
            fail("trigger verification failed")
    print(f"installed: {TRIGGER_NAME}")
    print(f"blocked: {', '.join(BLOCKED_LEVELS)}; all other levels are preserved")

def check(db: Path) -> None:
    with connect(db, readonly=True) as con:
        assert_schema(con)
        if not trigger_ok(con):
            fail("trigger missing or outdated")
    print(f"OK: {TRIGGER_NAME}")

def remove(db: Path) -> None:
    backup(db)
    with connect(db, readonly=False) as con:
        assert_schema(con)
        for name in KNOWN_TRIGGERS:
            con.execute(f"DROP TRIGGER IF EXISTS {name}")
        con.commit()
    print("removed known guard triggers; default logging restored")

def main() -> int:
    parser = argparse.ArgumentParser(description="Guard Codex SQLite low-level logs")
    parser.add_argument("command", choices=("status", "install", "check", "remove"))
    parser.add_argument("--db", type=Path, default=default_db())
    parser.add_argument("--recent-seconds", type=int, default=300)
    args = parser.parse_args()
    if args.recent_seconds < 1:
        fail("--recent-seconds must be positive")
    if args.command == "status":
        status(args.db.expanduser(), args.recent_seconds)
    elif args.command == "install":
        install(args.db.expanduser())
    elif args.command == "check":
        check(args.db.expanduser())
    else:
        remove(args.db.expanduser())
    return 0

if __name__ == "__main__":
    sys.exit(main())
```

脚本只依赖 Python 标准库。下载后先运行：

```powershell
py -3 .\codex_log_guard.py status --recent-seconds 300
```

macOS/Linux：

```bash
python3 ./codex_log_guard.py status --recent-seconds 300
```

`status` 会显示：

- 主数据库、WAL、SHM 的大小和更新时间；
- trigger 是否存在；
- 各日志级别的累计行数和估算字节量；
- 最近窗口的行数、字节量和写入速率；
- SQLite page count、free list 和可回收空间；
- 写入量最大的 target 名称。

脚本不会读取或打印 `feedback_log_body` 正文，因为其中可能包含任务内容、代码片段等隐私信息。

### 检查是否人为开启详细日志

Windows PowerShell：

```powershell
Get-ChildItem Env:RUST_LOG -ErrorAction SilentlyContinue
[Environment]::GetEnvironmentVariable("RUST_LOG", "User")
[Environment]::GetEnvironmentVariable("RUST_LOG", "Machine")

Select-String -Path "$HOME\.codex\config.toml" `
  -Pattern "trace|debug|verbosity|otel|log_level|log-level" `
  -CaseSensitive:$false
```

macOS/Linux：

```bash
echo "$RUST_LOG"
grep -Ei 'trace|debug|verbosity|otel|log_level|log-level' ~/.codex/config.toml
```

还要检查启动脚本、快捷方式和 shell profile。如果发现 `RUST_LOG=trace` 或类似设置，应先移除并重启 Codex，这才是从源头解决。

本电脑没有发现 `RUST_LOG` 或 `config.toml` 中的人为详细日志设置，所以更像是当前 Codex 日志管线自身的行为。

---

## 解决原理：在 SQLite INSERT 之前过滤低级别日志

SQLite trigger 是存储在数据库 schema 中的自动规则。Codex 每次向 `logs` 表 INSERT 时，SQLite 会先检查日志级别：

```text
Codex 生成日志
      ↓
尝试 INSERT 到 logs
      ↓
SQLite BEFORE INSERT trigger
      ├─ TRACE / DEBUG / INFO → RAISE(IGNORE)，取消本行写入
      └─ 其他级别            → 正常保存
```

核心 SQL：

```sql
CREATE TRIGGER codex_drop_low_value_logs
BEFORE INSERT ON logs
WHEN upper(coalesce(NEW.level, '')) IN ('TRACE', 'DEBUG', 'INFO')
BEGIN
    SELECT RAISE(IGNORE);
END;
```

SQLite 官方文档说明，trigger 会在指定数据库事件发生时自动逐行执行，`WHEN` 可以读取 `NEW.level`；这里使用 `RAISE(IGNORE)` 放弃当前插入。

### 为什么用黑名单，而不是只允许 WARN/ERROR？

原始项目 [Simmons-jg/codex-ssd-saver](https://github.com/Simmons-jg/codex-ssd-saver) 使用严格白名单：只保留 `WARN/WARNING/ERROR`。

这个策略虽然更激进，但有一个隐患：未来如果 Codex 新增 `FATAL`、`CRITICAL`、`NOTICE` 或其他重要级别，它们也会被静默丢弃。

本文配套脚本改为明确黑名单，只拦截已经确认高频的：

- `TRACE`
- `DEBUG`
- `INFO`

其他当前和未来级别默认保留。这样减少一部分极端写入收益，但更适合作为长期、保守的本地 workaround。

需要说明：trigger 不能阻止 Codex 在应用层生成、格式化日志，也不能消除发起 SQLite INSERT 的函数调用。它减少的是日志真正进入表之后的数据库页、WAL、清理和 checkpoint 开销。

---

## 安装/验证与回滚

### 1. 安装

```powershell
py -3 .\codex_log_guard.py install
```

脚本默认会先调用 SQLite backup API 创建一致性备份，并保存当时存在的 WAL/SHM 原始副本。备份文件名包含微秒，避免快速连续操作互相覆盖。

典型输出：

```text
Installed trigger: codex_drop_low_value_logs
Blocked levels: TRACE, DEBUG, INFO
Preserved by default: all other and future levels
```

trigger 存在数据库中，安装后立即生效：

- 不需要重启 Codex；
- 不需要脚本常驻；
- 不需要后台服务；
- 不会修改 Codex 可执行文件或 `config.toml`。

### 2. 结构检查

```powershell
py -3 .\codex_log_guard.py check
```

正常应输出：

```text
OK: trigger codex_drop_low_value_logs is installed and up to date
```

本文不建议默认安排每日自动重装。Codex 更新后先运行 `check`，确认 trigger 是否仍存在，再决定是否重新安装。

### 3. 活跃窗口验证

保持 Codex 正常工作，同时执行：

```powershell
py -3 .\codex_log_guard.py status --recent-seconds 30
```

重点观察：

- TRACE/DEBUG/INFO 的最大 ID 是否停止增长；
- 是否仍有被拦截级别的新行；
- WARN/ERROR 等其他级别能否继续保存；
- WAL 是否出现持续净增长。

如果窗口内所有低级别日志都被 trigger 拦截，同时没有 WARN/ERROR，`status` 会显示 `no rows`。结合下面两项判断：

```powershell
py -3 .\codex_log_guard.py check
py -3 .\codex_log_guard.py status --recent-seconds 60
```

结构为 `OK`、低级别最大 ID 不再变化、最近窗口为 `no rows`，并且安装前同样操作会产生大量日志，就能形成完整证据链。

### 4. 回滚

需要提交完整诊断日志、Codex 出现异常或不再需要方案时：

```powershell
py -3 .\codex_log_guard.py remove
```

`remove` 同样会先备份，然后删除已知 guard trigger，恢复默认日志行为。为了获取完整故障日志，建议移除后重启 Codex，再重新复现问题。

---

## 实际优化结果

本着软件工程思维，还是需要提供一点真实环境安装前后对比的：

| 指标 | 安装前 | 安装后 |
|---|---:|---:|
| TRACE/DEBUG/INFO | 1,087 条/分钟 | 最近 5 分钟 0 条 |
| 估算日志量 | 约 3.9 MiB/分钟 | 最近 5 分钟 0 |
| TRACE 最大 ID | 持续增长 | 固定在 `1045112` |
| DEBUG 最大 ID | 持续增长 | 固定在 `1045108` |
| INFO 最大 ID | 持续增长 | 固定在 `1045110` |
| 主数据库 | 53.2 MiB | 53.2 MiB，无增长 |
| trigger | 无 | `codex_drop_low_value_logs`，状态 OK |

后续真实运行中出现了两条新的 `ERROR`：

- 日志总最大 ID 从 `1045112` 增加到 `1045114`；
- ERROR 行数从 17 增加到 19；
- TRACE/DEBUG/INFO 三类最大 ID完全不变。

保守黑名单只拦截低级别日志，严重日志仍能正常保存。

另外做了一组临时数据库压力测试：逐次提交 500 条、每条 16 KiB 的 TRACE 日志。

| 状态 | 入库行数 | WAL 大小 |
|---|---:|---:|
| 无 trigger | 500 | 约 14.0 MiB |
| 有 trigger | 0 | 约 20 KiB |

在这个受控测试中，被拦截日志造成的 WAL 增长下降约 99.86%。

还是需要解释一下这个数字：它不代表 Codex 整体 CPU、UI 延迟或 SSD 物理写入同样提升如此幅度。但是可以确认目标日志的落库和数据库增长已经停止。

---

## 副作用与维护建议

### 会失去哪些信息

安装后新产生的 `TRACE/DEBUG/INFO` 不会保存在数据库中。这可能减少排查复杂网络、流式响应或内部状态问题时的上下文。

因此：

- 日常使用可以启用；
- 准备向官方提交完整诊断时先 `remove`；
- 重启 Codex 后重新复现；
- 问题结束后再根据新的 `status` 决定是否重新安装。

### Codex 更新后可能失效

SQLite 表被删除或重建时，关联 trigger 可能随之消失。每次 Codex 大版本更新后运行：

```powershell
py -3 .\codex_log_guard.py check
```

如果显示 missing/outdated，再先运行 `status`，确认问题仍存在后执行 `install`。不要无条件自动重装，以免未来官方迁移已经改变数据库用途或表结构。

### 并非全局 I/O 修复

该方案只处理 `logs_2.sqlite`：不处理 GPUCache、Chromium/LevelDB、会话 JSONL、不处理其他 Codex 临时文件、不改变应用层日志生成成本。

