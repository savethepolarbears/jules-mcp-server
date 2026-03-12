import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScheduleStorage } from '../storage/schedule-store.js';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';

vi.mock('fs/promises');
vi.mock('fs');

describe('ScheduleStorage', () => {
  let storage: ScheduleStorage;

  beforeEach(() => {
    storage = new ScheduleStorage();
    vi.clearAllMocks();
  });

  describe('load', () => {
    it('should initialize empty store on ENOENT error', async () => {
      // Setup error to simulate no file
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fsPromises.readFile).mockRejectedValueOnce(error);

      // We expect it to write the new empty store
      vi.mocked(fsPromises.writeFile).mockResolvedValueOnce();
      vi.mocked(fsPromises.rename).mockResolvedValueOnce();
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const store = await storage.load();

      expect(store).toEqual({ schedules: {}, version: '1.0.0' });
      expect(fsPromises.readFile).toHaveBeenCalled();
      expect(fsPromises.writeFile).toHaveBeenCalled();
      expect(fsPromises.rename).toHaveBeenCalled();
    });

    it('should backup file and return empty store if JSON is corrupted', async () => {
      vi.mocked(fsPromises.readFile).mockResolvedValueOnce('invalid json {[');
      vi.mocked(fsPromises.copyFile).mockResolvedValueOnce();
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const store = await storage.load();

      expect(store).toEqual({ schedules: {}, version: '1.0.0' });
      expect(fsPromises.copyFile).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse schedules.json. Backing up'));

      consoleSpy.mockRestore();
    });

    it('should load correct JSON data', async () => {
      const mockData = { schedules: { 'task-1': { id: 'task-1' } }, version: '1.0.0' };
      vi.mocked(fsPromises.readFile).mockResolvedValueOnce(JSON.stringify(mockData));
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const store = await storage.load();

      expect(store).toEqual(mockData);
    });
  });

  describe('save', () => {
    it('should write to temp file then rename (atomic write)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.writeFile).mockResolvedValueOnce();
      vi.mocked(fsPromises.rename).mockResolvedValueOnce();

      const mockStore = { schedules: {}, version: '1.0.0' };
      await storage.save(mockStore);

      expect(fsPromises.writeFile).toHaveBeenCalledWith(expect.stringContaining('.tmp'), expect.any(String), 'utf-8');
      expect(fsPromises.rename).toHaveBeenCalledWith(expect.stringContaining('.tmp'), expect.stringContaining('schedules.json'));
    });
  });
});
