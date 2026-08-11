import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";

// Type definitions to mirror AppConfig in server.ts
export interface UserConfig {
  port?: number;
  encryptedGithubToken?: string;
  githubToken?: string;
  githubRepo?: string | null;
  githubBranch?: string | null;
  githubTokenExpiry?: string | null;
  linkedRepo?: {
    owner: string;
    name: string;
    defaultBranch: string;
  } | null;
  userProfile?: {
    userId: string;
    authProvider: string;
    email: string;
    displayName?: string;
  } | null;
  userApiKey?: string;
  mcpStorageMode?: string;
}

export interface UserStore {
  getUserConfig(userId: string): Promise<UserConfig>;
  saveUserConfig(userId: string, config: UserConfig): Promise<void>;
  getUserConfigByApiKey(userApiKey: string): Promise<{ userId: string; config: UserConfig } | null>;
}

export interface PlatformAdapter {
  encryptSecret(plaintext: string): string;
  decryptSecret(ciphertext: string): string;
  getPort(): Promise<number>;
  getBindHost(): string;
  getOAuthRedirectBase(port?: number): string;
  getUserStore(): UserStore;
}

// ----------------------------------------------------
// Electron Local Offline Adapter
// ----------------------------------------------------
export class ElectronPlatformAdapter implements PlatformAdapter {
  private safeStorage: any = null;
  private configPath: string;

  constructor() {
    try {
      this.safeStorage = require("electron").safeStorage;
    } catch (e) {
      // safeStorage unavailable (fallback environment)
    }
    const configDir = path.join(os.homedir(), ".kankali");
    this.configPath = path.join(configDir, "config.json");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  encryptSecret(plaintext: string): string {
    if (this.safeStorage && this.safeStorage.isEncryptionAvailable()) {
      const encrypted = this.safeStorage.encryptString(plaintext);
      return encrypted.toString("base64");
    }
    const key = crypto.createHash("sha256").update(process.env.KANKALI_ENCRYPTION_KEY || "kankali-default-local-secret-key").digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  }

  decryptSecret(ciphertext: string): string {
    if (this.safeStorage && this.safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(ciphertext, "base64");
      return this.safeStorage.decryptString(buffer);
    }
    try {
      const [ivHex, tagHex, encryptedHex] = ciphertext.split(":");
      if (!ivHex || !tagHex || !encryptedHex) {
        return Buffer.from(ciphertext, "base64").toString("utf8");
      }
      const key = crypto.createHash("sha256").update(process.env.KANKALI_ENCRYPTION_KEY || "kankali-default-local-secret-key").digest();
      const iv = Buffer.from(ivHex, "hex");
      const tag = Buffer.from(tagHex, "hex");
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch {
      return ciphertext;
    }
  }

  async getPort(): Promise<number> {
    return process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  }

  getBindHost(): string {
    return "0.0.0.0";
  }

  getOAuthRedirectBase(port = 4577): string {
    return `http://127.0.0.1:${port}`;
  }

  getUserStore(): UserStore {
    const filePath = this.configPath;
    return {
      async getUserConfig(userId: string): Promise<UserConfig> {
        if (fs.existsSync(filePath)) {
          try {
            return JSON.parse(fs.readFileSync(filePath, "utf8"));
          } catch (e) {
            return {};
          }
        }
        return {};
      },
      async saveUserConfig(userId: string, config: UserConfig): Promise<void> {
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf8");
      },
      async getUserConfigByApiKey(userApiKey: string): Promise<{ userId: string; config: UserConfig } | null> {
        if (fs.existsSync(filePath)) {
          try {
            const config = JSON.parse(fs.readFileSync(filePath, "utf8"));
            return { userId: "local-user", config };
          } catch (e) {
            return null;
          }
        }
        return null;
      }
    };
  }
}

// ----------------------------------------------------
// Google Cloud Run Hosted Adapter
// ----------------------------------------------------
export class CloudPlatformAdapter implements PlatformAdapter {
  private encryptionKey: Buffer;
  private userStore: UserStore;

  constructor() {
    const rawKey = process.env.KANKALI_ENCRYPTION_KEY || "kankali-default-cloud-secret-key-32bytes";
    this.encryptionKey = crypto.createHash("sha256").update(rawKey).digest();

    if (process.env.KANKALI_TEST === "true") {
      this.userStore = this.createInMemoryStore();
    } else {
      try {
        this.userStore = this.createFirestoreStore();
      } catch {
        this.userStore = this.createInMemoryStore();
      }
    }
  }

  encryptSecret(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  }

  decryptSecret(ciphertext: string): string {
    const [ivHex, tagHex, encryptedHex] = ciphertext.split(":");
    if (!ivHex || !tagHex || !encryptedHex) {
      throw new Error("Invalid ciphertext format");
    }
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  async getPort(): Promise<number> {
    return process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
  }

  getBindHost(): string {
    return "0.0.0.0";
  }

  getOAuthRedirectBase(port?: number): string {
    return process.env.KANKALI_PUBLIC_URL || "https://kankali.io";
  }

  getUserStore(): UserStore {
    return this.userStore;
  }

  private createInMemoryStore(): UserStore {
    const store = new Map<string, UserConfig>();
    return {
      async getUserConfig(userId: string): Promise<UserConfig> {
        return store.get(userId) || {};
      },
      async saveUserConfig(userId: string, config: UserConfig): Promise<void> {
        store.set(userId, config);
      },
      async getUserConfigByApiKey(userApiKey: string): Promise<{ userId: string; config: UserConfig } | null> {
        for (const [userId, config] of store.entries()) {
          if (config.userApiKey === userApiKey) {
            return { userId, config };
          }
        }
        return null;
      }
    };
  }

  private createFirestoreStore(): UserStore {
    const memoryCache = new Map<string, UserConfig>();
    let db: any = null;
    let collectionRef: any = null;

    try {
      const admin = require("firebase-admin");
      if (admin.apps.length === 0) {
        admin.initializeApp();
      }
      db = admin.firestore();
      collectionRef = db.collection("kankali_users");
    } catch (e) {
      console.warn("Firebase Admin init skipped or failed:", e);
    }

    return {
      async getUserConfig(userId: string): Promise<UserConfig> {
        if (collectionRef) {
          try {
            const docRef = collectionRef.doc(userId);
            const snap = await docRef.get();
            if (snap.exists) {
              const data = snap.data() as UserConfig;
              memoryCache.set(userId, data);
              return data;
            }
          } catch (err: any) {
            console.warn("Firestore getUserConfig offline or error, using memory cache:", err?.message || err);
          }
        }
        return memoryCache.get(userId) || {};
      },
      async saveUserConfig(userId: string, config: UserConfig): Promise<void> {
        const existing = memoryCache.get(userId) || {};
        const updated = { ...existing, ...config };
        memoryCache.set(userId, updated);

        if (collectionRef) {
          try {
            const docRef = collectionRef.doc(userId);
            await docRef.set(config, { merge: true });
          } catch (err: any) {
            console.warn("Firestore saveUserConfig offline or error, saved to memory cache:", err?.message || err);
          }
        }
      },
      async getUserConfigByApiKey(userApiKey: string): Promise<{ userId: string; config: UserConfig } | null> {
        if (collectionRef) {
          try {
            const querySnap = await collectionRef.where("userApiKey", "==", userApiKey).limit(1).get();
            if (!querySnap.empty) {
              const doc = querySnap.docs[0];
              const data = doc.data() as UserConfig;
              memoryCache.set(doc.id, data);
              return { userId: doc.id, config: data };
            }
          } catch (err: any) {
            console.warn("Firestore getUserConfigByApiKey offline or error:", err?.message || err);
          }
        }
        for (const [userId, cfg] of memoryCache.entries()) {
          if (cfg.userApiKey === userApiKey) {
            return { userId, config: cfg };
          }
        }
        return null;
      }
    };
  }
}
