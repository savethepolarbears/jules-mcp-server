/**
 * Schedule Store - Local persistence for scheduled tasks
 * Implements the "Thick Server" pattern with file-based storage
 * Storage location: ~/.jules-mcp/schedules.json
 */

import { readFile, writeFile, mkdir, rename, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import crypto from 'crypto';
import type { ScheduledTask, ScheduleStore } from '../types/schedule.js';

class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const release = () => {
        if (this.queue.length > 0) {
          const next = this.queue.shift();
          if (next) next();
        } else {
          this.locked = false;
        }
      };

      if (!this.locked) {
        this.locked = true;
        resolve(release);
      } else {
        this.queue.push(() => resolve(release));
      }
    });
  }
}

/**
 * Handles persistence of scheduled tasks to the local file system.
 */
export class ScheduleStorage {
  private readonly storagePath: string;
  private readonly storageDir: string;
  private cache: ScheduleStore | null = null;
  private mutex = new Mutex();
  private readonly algorithm = 'aes-256-gcm';

  /**
   * Creates an instance of ScheduleStorage.
   * Initializes paths for storage directory and file.
   */
  constructor() {
    this.storageDir = join(homedir(), '.jules-mcp');
    this.storagePath = join(this.storageDir, 'schedules.enc');
  }

  private getEncryptionKey(): Buffer {
    const secret = process.env.JULES_API_KEY || process.env.JULES_ENCRYPTION_KEY || 'default-insecure-key-do-not-use-in-prod';
    return crypto.scryptSync(secret, 'salt', 32);
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.getEncryptionKey(), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return JSON.stringify({
      iv: iv.toString('hex'),
      encryptedData: encrypted,
      authTag: authTag.toString('hex')
    });
  }

  private decrypt(text: string): string {
    const { iv, encryptedData, authTag } = JSON.parse(text);
    const decipher = crypto.createDecipheriv(
      this.algorithm, 
      this.getEncryptionKey(), 
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Ensures storage directory exists.
   * Creates the directory if it doesn't exist.
   */
  private async ensureStorageDir(): Promise<void> {
    if (!existsSync(this.storageDir)) {
      await mkdir(this.storageDir, { recursive: true });
    }
  }

  /**
   * Loads schedules from disk.
   * If storage file doesn't exist, initializes an empty store.
   * If the file contains invalid JSON, it creates a backup and initializes an empty store.
   * @returns The loaded schedule store.
   * @throws Error if loading fails for non-ENOENT reasons and isn't a JSON parse error.
   */
  async load(): Promise<ScheduleStore> {
    const release = await this.mutex.acquire();
    try {
      if (this.cache) {
        return this.cache;
      }

      await this.ensureStorageDir();

      // Migrate from old unencrypted storage if it exists
      const oldStoragePath = join(this.storageDir, 'schedules.json');
      if (existsSync(oldStoragePath) && !existsSync(this.storagePath)) {
        const oldData = await readFile(oldStoragePath, 'utf-8');
        await writeFile(this.storagePath, this.encrypt(oldData), 'utf-8');
        await rename(oldStoragePath, oldStoragePath + '.bak');
      }

      try {
        const encryptedContent = await readFile(this.storagePath, 'utf-8');
        try {
          const data = this.decrypt(encryptedContent);
          this.cache = JSON.parse(data) as ScheduleStore;
          return this.cache;
        } catch (parseError) {
          // Handle corrupted JSON by backing it up
          const backupPath = `${this.storagePath}.corrupted.${Date.now()}`;
          console.error(`Failed to parse schedules.enc. Backing up corrupted file to ${backupPath}`);
          try {
              await copyFile(this.storagePath, backupPath);
          } catch (backupError) {
              console.error(`Failed to backup corrupted file: ${backupError}`);
          }

          // Return empty store instead of crashing
          const emptyStore: ScheduleStore = {
            schedules: {},
            version: '1.0.0',
          };
          this.cache = emptyStore;
          return emptyStore;
        }
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          // Initialize empty store
          const emptyStore: ScheduleStore = {
            schedules: {},
            version: '1.0.0',
          };
          const encrypted = this.encrypt(JSON.stringify(emptyStore, null, 2));
          await writeFile(this.storagePath, encrypted, 'utf-8');
          this.cache = emptyStore;
          return emptyStore;
        }

        throw new Error(
          `Failed to load schedules from ${this.storagePath}: ${error}`
        );
      }
    } finally {
      release();
    }
  }

  /**
   * Saves schedules to disk using atomic writes.
   * Writes to a temporary file first, then renames it to the target path.
   * @param store - The schedule store to save.
   * @throws Error if saving fails.
   */
  async save(store: ScheduleStore): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      await this.ensureStorageDir();

      const tempPath = `${this.storagePath}.tmp`;

      try {
        const data = JSON.stringify(store, null, 2);
        const encrypted = this.encrypt(data);
        await writeFile(tempPath, encrypted, 'utf-8');
        await rename(tempPath, this.storagePath);
        this.cache = store;
      } catch (error) {
        throw new Error(
          `Failed to save schedules to ${this.storagePath}: ${error}`
        );
      }
    } finally {
      release();
    }
  }

  /**
   * Adds or updates a scheduled task.
   * @param task - The task to upsert.
   */
  async upsertTask(task: ScheduledTask): Promise<void> {
    const store = await this.load();
    store.schedules[task.id] = task;
    await this.save(store);
  }

  /**
   * Retrieves a specific task by ID.
   * @param id - The ID of the task.
   * @returns The task if found, otherwise undefined.
   */
  async getTask(id: string): Promise<ScheduledTask | undefined> {
    const store = await this.load();
    return store.schedules[id];
  }

  /**
   * Retrieves a task by name.
   * @param name - The name of the task.
   * @returns The task if found, otherwise undefined.
   */
  async getTaskByName(name: string): Promise<ScheduledTask | undefined> {
    const store = await this.load();
    return Object.values(store.schedules).find((task) => task.name === name);
  }

  /**
   * Lists all tasks.
   * @returns An array of all scheduled tasks.
   */
  async listTasks(): Promise<ScheduledTask[]> {
    const store = await this.load();
    return Object.values(store.schedules);
  }

  /**
   * Deletes a task by ID.
   * @param id - The ID of the task to delete.
   * @returns True if the task was deleted, false if it wasn't found.
   */
  async deleteTask(id: string): Promise<boolean> {
    const store = await this.load();
    if (!store.schedules[id]) {
      return false;
    }
    delete store.schedules[id];
    await this.save(store);
    return true;
  }

  /**
   * Updates the last run information for a task.
   * @param id - The ID of the task.
   * @param timestamp - The timestamp of the run.
   * @param sessionId - The session ID of the run (optional).
   */
  async updateLastRun(
    id: string,
    timestamp: string,
    sessionId?: string
  ): Promise<void> {
    const store = await this.load();
    const task = store.schedules[id];
    if (task) {
      task.lastRun = timestamp;
      task.lastSessionId = sessionId;
      await this.save(store);
    }
  }

  /**
   * Clears the cache, forcing a reload on next access.
   */
  invalidateCache(): void {
    this.cache = null;
  }
}
