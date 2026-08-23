import { describe, expect, test } from 'vitest';
import { WorkbenchDatabase } from '../db/database';
import { deserializeEntity, entityRegistry, serializeEntity } from './entityRegistry';
import type { EntityKind, EntityValueByKind } from './types';

const timestamp = '2026-08-23T01:02:03.000Z';
const base = { id: '00000000-0000-4000-8000-000000000001', createdAt: timestamp, updatedAt: timestamp };

const cases: Array<[EntityKind, EntityValueByKind[EntityKind], Record<string, unknown>]> = [
  ['todos', {
    ...base, title: '审核培养方案', description: '核对课程目标', role: 'dean', startAt: null,
    endAt: '2026-08-24T10:00:00.000Z', remindAt: null, priority: 'high', status: 'open', sourceType: 'idea', sourceId: 'idea-1',
  }, {
    id: base.id, created_at: timestamp, updated_at: timestamp, title: '审核培养方案', description: '核对课程目标', role: 'dean', start_at: null,
    end_at: '2026-08-24T10:00:00.000Z', remind_at: null, priority: 'high', status: 'open', source_type: 'idea', source_id: 'idea-1',
  }],
  ['semesters', {
    ...base, name: '2026 秋季学期', startDate: '2026-09-01', endDate: '2027-01-15', totalWeeks: 18, isActive: true,
  }, {
    id: base.id, created_at: timestamp, updated_at: timestamp, name: '2026 秋季学期', start_date: '2026-09-01', end_date: '2027-01-15', total_weeks: 18, is_active: true,
  }],
  ['courses', {
    ...base, semesterId: 'semester-1', name: '软件工程', location: 'A101', teacher: '张老师', weekday: 1, startTime: '08:00', endTime: '09:40',
    startWeek: 1, endWeek: 18, weekRule: { kind: 'explicit' as const, weeks: [1, 3, 5] }, notes: '带电脑',
  }, {
    id: base.id, created_at: timestamp, updated_at: timestamp, semester_id: 'semester-1', name: '软件工程', location: 'A101', teacher: '张老师', weekday: 1,
    start_time: '08:00', end_time: '09:40', start_week: 1, end_week: 18, week_rule: { kind: 'explicit', weeks: [1, 3, 5] }, notes: '带电脑',
  }],
  ['teachers', { ...base, name: '张老师', department: '计算机学院', archivedAt: null }, {
    id: base.id, created_at: timestamp, updated_at: timestamp, name: '张老师', department: '计算机学院', archived_at: null,
  }],
  ['teacher_year_summaries', { ...base, teacherId: 'teacher-1', year: '2026', state: 'reported' }, {
    id: base.id, created_at: timestamp, updated_at: timestamp, teacher_id: 'teacher-1', year: '2026', state: 'reported',
  }],
  ['teacher_records', {
    ...base, teacherId: 'teacher-1', year: '2026', type: 'meeting', date: '2026-08-23', title: '组会', content: '讨论进展', status: 'attended', notes: '',
  }, {
    id: base.id, created_at: timestamp, updated_at: timestamp, teacher_id: 'teacher-1', year: '2026', type: 'meeting', date: '2026-08-23', title: '组会', content: '讨论进展', status: 'attended', notes: '',
  }],
  ['mentorships', {
    ...base, teacherId: 'teacher-1', academicYear: '2026-2027', studentName: '李同学', grade: '2024', major: '软件工程', topic: '同步设计', status: 'active', notes: '',
  }, {
    id: base.id, created_at: timestamp, updated_at: timestamp, teacher_id: 'teacher-1', academic_year: '2026-2027', student_name: '李同学', grade: '2024', major: '软件工程', topic: '同步设计', status: 'active', notes: '',
  }],
  ['research_items', {
    ...base, title: 'Offline first', authors: 'Smith', source: 'Journal', year: null, urlOrDoi: 'https://example.test', tags: ['sync', 'offline'], status: 'reading', rating: null,
    abstract: '摘要', notes: '', sourceType: null, sourceId: null,
  }, {
    id: base.id, created_at: timestamp, updated_at: timestamp, title: 'Offline first', authors: 'Smith', source: 'Journal', year: null, url_or_doi: 'https://example.test', tags: ['sync', 'offline'], status: 'reading', rating: null,
    abstract: '摘要', notes: '', source_type: null, source_id: null,
  }],
  ['learning_methods', {
    ...base, name: '番茄钟', scenario: '写作', steps: '专注 25 分钟', evaluation: '完成一节', tags: ['专注', '时间管理'],
  }, {
    id: base.id, created_at: timestamp, updated_at: timestamp, name: '番茄钟', scenario: '写作', steps: '专注 25 分钟', evaluation: '完成一节', tags: ['专注', '时间管理'],
  }],
  ['ideas', { ...base, content: '做一个同步引擎', tags: ['同步'], pinned: true, archivedAt: null }, {
    id: base.id, created_at: timestamp, updated_at: timestamp, content: '做一个同步引擎', tags: ['同步'], pinned: true, archived_at: null,
  }],
  ['lesson_plans', {
    ...base, courseId: null, chapter: '第一章', objectives: '理解离线优先', outline: '概念', resources: '讲义', activities: '讨论', plannedDate: null,
    status: 'inProgress', sourceType: 'idea', sourceId: 'idea-1',
  }, {
    id: base.id, created_at: timestamp, updated_at: timestamp, course_id: null, chapter: '第一章', objectives: '理解离线优先', outline: '概念', resources: '讲义', activities: '讨论', planned_date: null,
    status: 'inProgress', source_type: 'idea', source_id: 'idea-1',
  }],
  ['students', { ...base, name: '王同学', program: '硕士', cohort: '2025', contact: 'wang@example.test', notes: '', archivedAt: null }, {
    id: base.id, created_at: timestamp, updated_at: timestamp, name: '王同学', program: '硕士', cohort: '2025', contact: 'wang@example.test', notes: '', archived_at: null,
  }],
  ['student_records', {
    ...base, studentId: 'student-1', date: '2026-08-23', category: 'research', rating: 'positive', content: '完成论文初稿', followUp: '', tags: ['论文'],
  }, {
    id: base.id, created_at: timestamp, updated_at: timestamp, student_id: 'student-1', date: '2026-08-23', category: 'research', rating: 'positive', content: '完成论文初稿', follow_up: '', tags: ['论文'],
  }],
  ['app_settings', { key: 'dashboard-layout', value: { sections: ['todos', 'courses'] }, updatedAt: timestamp }, {
    key: 'dashboard-layout', value: { sections: ['todos', 'courses'] }, updated_at: timestamp,
  }],
];

describe('entity registry', () => {
  test.each(cases)('%s serializes domain fields to the cloud row and round-trips them', (kind, value, expectedRow) => {
    const row = serializeEntity(kind, value);

    expect(row).toEqual(expectedRow);
    expect(deserializeEntity(kind, row)).toEqual(value);
  });

  test('uses app setting keys as entity identities', () => {
    expect(entityRegistry.app_settings.entityId({ key: 'theme' })).toBe('theme');
  });

  test('does not add server-only receipt metadata to domain entities', () => {
    const todo = cases[0][1] as EntityValueByKind['todos'];
    const cloudRow = {
      ...serializeEntity('todos', todo),
      user_id: 'user-1',
      deleted_at: '2026-08-24T01:02:03.000Z',
      server_updated_at: '2026-08-24T01:02:04.000Z',
    };

    expect(deserializeEntity('todos', cloudRow)).toEqual(todo);
  });

  test('adds the version 2 operation queue and metadata stores', async () => {
    const db = new WorkbenchDatabase(`registry-${crypto.randomUUID()}`);

    try {
      expect(db.syncOperations.schema.primKey.keyPath).toBe('id');
      expect(db.syncOperations.schema.indexes.map((index) => index.name)).toEqual([
        'userId', '[userId+entityKind+entityId]', 'createdAt',
      ]);
      expect(db.syncMetadata.schema.primKey.keyPath).toBe('key');
    } finally {
      await db.delete();
    }
  });
});
