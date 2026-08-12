# Task 7 完成报告：教师管理与科研导师

## 交付内容

- 教师名册：新增、编辑、停用与详情查看。
- 年度记录：单条新增、年度补全、教师选择、批量例会（参会/缺席/请假）及批量材料登记。
- 年度摘要：以 `teacherId + year` 为唯一键；补全仅为在岗教师创建 `empty` 摘要，重复操作无副作用，且不创建工作记录或覆盖既有摘要。
- 批量写入：会议与材料均在单一 Repository transaction 内完成；测试覆盖了中途失败时记录和摘要整体回滚。
- 科研导师：从教师详情创建指导学生记录，并支持按学年、教师、年级和进展状态筛选汇总。
- 路由：`/teachers` 已接入实际教师管理页。页面只使用 Repository hooks，不直接访问 Dexie。

## 接手审计与 TDD 处理

接手时工作区有未跟踪的 `src/domain/teacherOperations.ts`、`src/domain/teacherOperations.test.ts` 和 `src/features/teachers/TeacherPage.test.tsx`。领域测试在遗留生产实现存在时直接通过，因此不能作为已验证的 RED；已删除该遗留生产文件，运行测试并确认因模块缺失而失败，再按测试重写最小领域实现。页面测试开始时因 `TeacherPage` 尚不存在而处于有效 RED，随后实现并变绿。页面测试中的一处 `findAllByText` 时序断言会立即匹配对话框中的单选项，已改为等待持久化记录和渲染后的状态，以稳定验证用户流。

## 验证

2026-08-12 在本 worktree 完成：

- `npm run test:run`：15 个测试文件、62 个测试全部通过。
- `npm run typecheck`：通过。
- `npm run build`：通过。
- `git diff --check`：通过。

构建保留现有 Vite 的单 chunk 大小警告（686.97 kB），未在本任务范围内进行代码分包调整。
