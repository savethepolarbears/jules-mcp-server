/**
 * Schedule Store - Local persistence for scheduled tasks
 * Implements the "Thick Server" pattern with file-based storage
 * Storage location: ~/.jules-mcp/schedules.json
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { ScheduledTask, ScheduleStore } from '../types/schedule.js';

/**
 * Handles persistence of scheduled tasks to the local file system.
 */
export class ScheduleStorage {
  private readonly storagePath: string;
  private readonly storageDir: string;
  private cache: ScheduleStore | null = null;

  /**
   * Creates an instance of ScheduleStorage.
   * Initializes paths for storage directory and file.
   */
  constructor() {
    this.storageDir = join(homedir(), '.jules-mcp');
    this.storagePath = join(this.storageDir, 'schedules.json');
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
   * @returns The loaded schedule store.
   * @throws Error if loading fails.
   */
  async load(): Promise<ScheduleStore> {
    if (this.cache) {
      return this.cache;
    }

    await this.ensureStorageDir();

    if (!existsSync(this.storagePath)) {
      // Initialize empty store
      const emptyStore: ScheduleStore = {
        schedules: {},
        version: '1.0.0',
      };
      await this.save(emptyStore);
      return emptyStore;
    }

    try {
      const data = await readFile(this.storagePath, 'utf-8');
      this.cache = JSON.parse(data) as ScheduleStore;
      return this.cache;
    } catch (error) {
      throw new Error(
        `Failed to load schedules from ${this.storagePath}: ${error}`
      );
    }
  }

  /**
   * Saves schedules to disk.
   * @param store - The schedule store to save.
   * @throws Error if saving fails.
   */
  async save(store: ScheduleStore): Promise<void> {
    await this.ensureStorageDir();

    try {
      const data = JSON.stringify(store, null, 2);
      await writeFile(this.storagePath, data, 'utf-8');
      this.cache = store;
    } catch (error) {
      throw new Error(
        `Failed to save schedules to ${this.storagePath}: ${error}`
      );
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
