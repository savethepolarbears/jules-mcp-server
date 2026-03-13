import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ScheduleStorage } from "../storage/schedule-store.js";
import * as fsPromises from "fs/promises";
import * as fs from "fs";
import crypto from "crypto";

vi.mock("fs/promises");
vi.mock("fs");

describe("ScheduleStorage", () => {
  let storage: ScheduleStorage;

  beforeEach(() => {
    process.env.JULES_API_KEY = "test-key";
    storage = new ScheduleStorage();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.JULES_API_KEY;
  });

  // Helper to generate valid encrypted payload for tests
  async function createEncryptedPayload(
    data: unknown,
    apiKey: string,
  ): Promise<string> {
    const iv = crypto.randomBytes(16);
    const key = await new Promise<Buffer>((resolve, reject) =>
      crypto.scrypt(apiKey, salt, 32, (err, k) =>
        err ? reject(err) : resolve(k),
      ),
    );
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
    encrypted += cipher.final("hex");
    return JSON.stringify({
      salt: salt.toString("hex"),
      iv: iv.toString("hex"),
      encryptedData: encrypted,
      authTag: cipher.getAuthTag().toString("hex"),
    });
  }

  it("should throw Security Error when neither env var is set", async () => {
    vi.mocked(fsPromises.readFile).mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    const origApiKey = process.env.JULES_API_KEY;
    const origEncKey = process.env.JULES_ENCRYPTION_KEY;
    try {
      delete process.env.JULES_API_KEY;
      delete process.env.JULES_ENCRYPTION_KEY;
      const storage = new ScheduleStorage();
      await expect(storage.listTasks()).rejects.toThrow("Security Error");
    } finally {
      if (origApiKey !== undefined) process.env.JULES_API_KEY = origApiKey;
      if (origEncKey !== undefined)
        process.env.JULES_ENCRYPTION_KEY = origEncKey;
    }
  });

  describe("load", () => {
    it("should initialize empty store on ENOENT error", async () => {
      // Setup error to simulate no file
      const error = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      vi.mocked(fsPromises.readFile).mockRejectedValueOnce(error);

      // We expect it to write the new empty store
      vi.mocked(fsPromises.writeFile).mockResolvedValueOnce();
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const store = await storage.load();

      expect(store).toEqual({ schedules: {}, version: "1.0.0" });
      expect(fsPromises.readFile).toHaveBeenCalled();
      expect(fsPromises.writeFile).toHaveBeenCalled();
    });

    it("should backup file and return empty store if JSON is corrupted", async () => {
      vi.mocked(fsPromises.readFile).mockResolvedValueOnce("invalid json {[");
      vi.mocked(fsPromises.copyFile).mockResolvedValueOnce();
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const store = await storage.load();

      expect(store).toEqual({ schedules: {}, version: "1.0.0" });
      expect(fsPromises.copyFile).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to parse schedules.enc. Backing up"),
      );

      consoleSpy.mockRestore();
    });

    it("should load correct JSON data", async () => {
      const mockData = {
        schedules: { "task-1": { id: "task-1" } },
        version: "1.0.0",
      };
      const encryptedPayload = await createEncryptedPayload(
        mockData,
        "test-key",
      );

      vi.mocked(fsPromises.readFile).mockResolvedValueOnce(encryptedPayload);
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const store = await storage.load();

      expect(store).toEqual(mockData);
    });

    it("should migrate from unencrypted schedules.json", async () => {
      vi.mocked(fs.existsSync).mockImplementation((path: fs.PathLike) => {
        if (path.toString().endsWith("schedules.enc")) return false;
        if (path.toString().endsWith("schedules.json")) return true;
        return true;
      });
      vi.mocked(fsPromises.readFile).mockImplementation(
        async (p: fs.PathLike | fsPromises.FileHandle) => {
          const pathStr =
            typeof p === "string"
              ? p
              : Buffer.isBuffer(p)
                ? p.toString()
                : p instanceof URL
                  ? p.toString()
                  : "";
          if (pathStr.endsWith("schedules.json"))
            return JSON.stringify({ version: "1.0.0", schedules: {} });
          const error = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
          throw error;
        },
      );
      vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);
      vi.mocked(fsPromises.rename).mockResolvedValue(undefined);
      vi.mocked(fsPromises.chmod).mockResolvedValue(undefined);

      await storage.load();

      expect(fsPromises.rename).toHaveBeenCalledWith(
        expect.stringContaining(".json"),
        expect.stringContaining(".bak"),
      );
      expect(fsPromises.writeFile).toHaveBeenCalled();
    });
  });

  describe("save", () => {
    it("should write to temp file then rename (atomic write)", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.writeFile).mockResolvedValueOnce();
      vi.mocked(fsPromises.rename).mockResolvedValueOnce();

      const mockStore = { schedules: {}, version: "1.0.0" };
      await storage.save(mockStore);

      expect(fsPromises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(".tmp"),
        expect.any(String),
        expect.objectContaining({ mode: 0o600 }),
      );
      expect(fsPromises.rename).toHaveBeenCalledWith(
        expect.stringContaining(".tmp"),
        expect.stringContaining("schedules.enc"),
      );
    });
  });

  describe("CRUD operations", () => {
    const mockTask = {
      id: "task-1",
      name: "Test Task",
      cron: "0 * * * *",
      taskPayload: { prompt: "test", source: "test", automationMode: "AUTO_CREATE_PR" as const },
      createdAt: "2026-01-01T00:00:00Z",
      enabled: true,
    };

    beforeEach(() => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fsPromises.writeFile).mockResolvedValue();
      vi.mocked(fsPromises.rename).mockResolvedValue();
    });

    it("should upsert a task and update cache", async () => {
      vi.mocked(fsPromises.readFile).mockResolvedValueOnce(
        await createEncryptedPayload({ schedules: {}, version: "1.0.0" }, "test-key")
      );

      await storage.upsertTask(mockTask);

      // Reading from cache since load was called
      const task = await storage.getTask("task-1");
      expect(task).toEqual(mockTask);
      expect(fsPromises.writeFile).toHaveBeenCalled();
    });

    it("should get a task by name", async () => {
      vi.mocked(fsPromises.readFile).mockResolvedValueOnce(
        await createEncryptedPayload({ schedules: { "task-1": mockTask }, version: "1.0.0" }, "test-key")
      );

      const task = await storage.getTaskByName("Test Task");
      expect(task).toEqual(mockTask);

      const notFound = await storage.getTaskByName("Unknown");
      expect(notFound).toBeUndefined();
    });

    it("should list all tasks", async () => {
      vi.mocked(fsPromises.readFile).mockResolvedValueOnce(
        await createEncryptedPayload({ schedules: { "task-1": mockTask }, version: "1.0.0" }, "test-key")
      );

      const tasks = await storage.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toEqual(mockTask);
    });

    it("should delete a task", async () => {
      vi.mocked(fsPromises.readFile).mockResolvedValueOnce(
        await createEncryptedPayload({ schedules: { "task-1": mockTask }, version: "1.0.0" }, "test-key")
      );

      const deleted = await storage.deleteTask("task-1");
      expect(deleted).toBe(true);

      const tasks = await storage.listTasks();
      expect(tasks).toHaveLength(0);
      expect(fsPromises.writeFile).toHaveBeenCalled();
    });

    it("should return false when deleting non-existent task", async () => {
      vi.mocked(fsPromises.readFile).mockResolvedValueOnce(
        await createEncryptedPayload({ schedules: {}, version: "1.0.0" }, "test-key")
      );

      const deleted = await storage.deleteTask("unknown");
      expect(deleted).toBe(false);
    });

    it("should update last run information", async () => {
      vi.mocked(fsPromises.readFile).mockResolvedValueOnce(
        await createEncryptedPayload({ schedules: { "task-1": mockTask }, version: "1.0.0" }, "test-key")
      );

      await storage.updateLastRun("task-1", "2026-01-02T00:00:00Z", "sess-1");

      const task = await storage.getTask("task-1");
      expect(task?.lastRun).toBe("2026-01-02T00:00:00Z");
      expect(task?.lastSessionId).toBe("sess-1");
      expect(fsPromises.writeFile).toHaveBeenCalled();
    });

    it("should invalidate cache and reload on next access", async () => {
      vi.mocked(fsPromises.readFile).mockResolvedValue(
        await createEncryptedPayload({ schedules: { "task-1": mockTask }, version: "1.0.0" }, "test-key")
      );

      await storage.listTasks(); // Populates cache
      expect(fsPromises.readFile).toHaveBeenCalledTimes(1);

      await storage.listTasks(); // Reads from cache
      expect(fsPromises.readFile).toHaveBeenCalledTimes(1);

      storage.invalidateCache();

      await storage.listTasks(); // Reloads from disk
      expect(fsPromises.readFile).toHaveBeenCalledTimes(2);
    });
  });
});

describe("Mutex", () => {
  it("should queue multiple acquisitions", async () => {
    interface StorageWithMutex {
      mutex: { acquire: () => Promise<() => void> };
    }
    const storage = new ScheduleStorage();
    let firstResolved = false;
    let secondResolved = false;

    const p1 = (storage as unknown as StorageWithMutex).mutex
      .acquire()
      .then((release: () => void) => {
        firstResolved = true;
        return release;
      });

    const p2 = (storage as unknown as StorageWithMutex).mutex
      .acquire()
      .then((release: () => void) => {
        secondResolved = true;
        return release;
      });

    const release1 = await p1;
    expect(firstResolved).toBe(true);
    expect(secondResolved).toBe(false);

    release1();

    const release2 = await p2;
    expect(secondResolved).toBe(true);
    release2();
  });
});
