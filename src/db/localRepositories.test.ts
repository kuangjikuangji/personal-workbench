import { describe, expect, test } from 'vitest';
import { createTestRepositories } from '../test/database';

describe('local repositories', () => {
  test('stores independent records with generated audit fields', async () => {
    const repos = createTestRepositories();

    const saved = await repos.todos.create({
      title: '审核培养方案',
      description: '',
      role: 'dean',
      startAt: null,
      endAt: null,
      remindAt: null,
      priority: 'normal',
      status: 'open',
    });

    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.createdAt).toEqual(saved.updatedAt);
    expect(saved.sourceType).toBeNull();
    expect(saved.sourceId).toBeNull();
    expect(await repos.todos.get(saved.id)).toEqual(saved);
  });

  test('lists, replaces, patches, and deletes independent records', async () => {
    const repos = createTestRepositories();
    const created = await repos.teachers.create({
      name: '张老师',
      department: '',
      archivedAt: null,
    });

    expect(await repos.teachers.list()).toEqual([created]);

    const replaced = await repos.teachers.put({ ...created, department: '计算机学院' });
    expect(replaced).toEqual({ ...created, department: '计算机学院' });

    const patched = await repos.teachers.patch(created.id, {
      name: '李老师',
      updatedAt: '2000-01-01T00:00:00.000Z',
    });
    expect(patched).toMatchObject({
      id: created.id,
      name: '李老师',
      department: '计算机学院',
      createdAt: created.createdAt,
    });
    expect(patched.updatedAt).not.toEqual('2000-01-01T00:00:00.000Z');

    await repos.teachers.delete(created.id);
    expect(await repos.teachers.get(created.id)).toBeUndefined();
  });

  test('rolls back an atomic batch when one write fails', async () => {
    const repos = createTestRepositories();

    await expect(repos.transaction(async () => {
      await repos.teachers.create({ name: '张老师', department: '', archivedAt: null });
      throw new Error('stop');
    })).rejects.toThrow('stop');

    expect(await repos.teachers.list()).toEqual([]);
  });

  test('enforces one yearly summary per teacher and year', async () => {
    const repos = createTestRepositories();
    const teacher = await repos.teachers.create({
      name: '张老师',
      department: '',
      archivedAt: null,
    });

    await repos.teacherYearSummaries.create({
      teacherId: teacher.id,
      year: '2026',
      state: 'empty',
    });

    await expect(repos.teacherYearSummaries.create({
      teacherId: teacher.id,
      year: '2026',
      state: 'reported',
    })).rejects.toThrow();
  });

  test('persists settings by key with repository-managed audit time', async () => {
    const repos = createTestRepositories();

    const saved = await repos.settings.put({ key: 'theme', value: 'dark' });

    expect(saved).toMatchObject({ key: 'theme', value: 'dark' });
    expect(saved.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await repos.settings.get('theme')).toEqual(saved);
  });
});
