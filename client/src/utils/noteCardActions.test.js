import { describe, it, expect, vi } from 'vitest';
import { buildNoteStateActions } from './noteCardActions';

const handlers = () => ({
  archiveNote: vi.fn(),
  unarchiveNote: vi.fn(),
  togglePin: vi.fn(),
  trashNote: vi.fn(),
  restoreNote: vi.fn(),
  deleteNote: vi.fn(),
});

const build = (note = {}, view = 'main') => {
  const actions = handlers();
  const list = buildNoteStateActions({
    note: { id: 'n1', is_pinned: false, ...note },
    view,
    actions,
  });
  return { list, keys: list.map(a => a.key), actions };
};

describe('buildNoteStateActions', () => {
  it('offers archive, pin and trash on a normal note in the main view', () => {
    expect(build().keys).toEqual(['archive', 'pin', 'trash']);
  });

  it('swaps archive for unarchive once the note is archived', () => {
    expect(build({ is_archived: true }, 'archive').keys).toEqual(['unarchive', 'pin', 'trash']);
  });

  it('offers restore and permanent delete in the trash view, and no trash', () => {
    expect(build({ is_deleted: true }, 'trash').keys).toEqual(['pin', 'restore', 'deleteForever']);
  });

  it('never offers archive on a deleted note surfaced outside the trash view', () => {
    // Search results can show a trashed note while `view` is still 'main'.
    expect(build({ is_deleted: true }).keys).toEqual(['pin', 'trash']);
  });

  it('flips the pin icon and label for a pinned note', () => {
    const pin = build({ is_pinned: true }).list.find(a => a.key === 'pin');
    expect(pin.icon).toBe('pinned');
    expect(pin.title).toBe('Unpin');

    const unpinned = build().list.find(a => a.key === 'pin');
    expect(unpinned.icon).toBe('pin');
    expect(unpinned.title).toBe('Pin');
  });

  it('wires each run() to its handler with the note id', () => {
    const main = build();
    main.list.forEach(a => a.run());
    expect(main.actions.archiveNote).toHaveBeenCalledWith('n1');
    expect(main.actions.togglePin).toHaveBeenCalledWith('n1');
    expect(main.actions.trashNote).toHaveBeenCalledWith('n1');
    expect(main.actions.unarchiveNote).not.toHaveBeenCalled();

    const trash = build({ is_deleted: true }, 'trash');
    trash.list.forEach(a => a.run());
    expect(trash.actions.restoreNote).toHaveBeenCalledWith('n1');
    expect(trash.actions.deleteNote).toHaveBeenCalledWith('n1');
  });
});
