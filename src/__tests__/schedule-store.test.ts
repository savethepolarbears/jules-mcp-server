import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScheduleStorage } from '../storage/schedule-store.js';
import * as fsPromises from 'fs/promises';
import * as fs from 'fs';
import crypto from 'crypto';

vi.mock('fs/promises');
vi.mock('fs');

describe('ScheduleStorage', () => {
  let storage: ScheduleStorage;

  beforeEach(() => {
    process.env.JULES_API_KEY = 'test-key';
    storage = new ScheduleStorage();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.JULES_API_KEY;
  });

  // Helper to generate valid encrypted payload for tests
  const createEncryptedPayload = (data: unknown) => {
    const key = crypto.scryptSync('test-key', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return JSON.stringify({
      iv: iv.toString('hex'),
      encryptedData: encrypted,
      authTag: cipher.getAuthTag().toString('hex')
    });
  };

  describe('load', () => {
    it('should initialize empty store on ENOENT error', async () => {
      // Setup error to simulate no file
      const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      vi.mocked(fsPromises.readFile).mockRejectedValueOnce(error);

      // We expect it to write the new empty store
      vi.mocked(fsPromises.writeFile).mockResolvedValueOnce();
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const store = await storage.load();

      expect(store).toEqual({ schedules: {}, version: '1.0.0' });
      expect(fsPromises.readFile).toHaveBeenCalled();
      expect(fsPromises.writeFile).toHaveBeenCalled();
    });

    it('should backup file and return empty store if JSON is corrupted', async () => {
      vi.mocked(fsPromises.readFile).mockResolvedValueOnce('invalid json {[');
      vi.mocked(fsPromises.copyFile).mockResolvedValueOnce();
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const store = await storage.load();

      expect(store).toEqual({ schedules: {}, version: '1.0.0' });
      expect(fsPromises.copyFile).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse schedules.enc. Backing up'));

      consoleSpy.mockRestore();
    });

    it('should load correct JSON data', async () => {
      const mockData = { schedules: { 'task-1': { id: 'task-1' } }, version: '1.0.0' };
      const encryptedPayload = createEncryptedPayload(mockData);
      
      vi.mocked(fsPromises.readFile).mockResolvedValueOnce(encryptedPayload);
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

      expect(fsPromises.writeFile).toHaveBeenCalledWith(expect.stringContaining('.tmp'), expect.any(String), expect.objectContaining({ encoding: 'utf-8' }));
      expect(fsPromises.rename).toHaveBeenCalledWith(expect.stringContaining('.tmp'), expect.stringContaining('schedules.enc'));
    });
  });
});
