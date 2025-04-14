import 'dotenv/config';

class Settings {
  private static ensureEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
      throw new Error(`Environment variable "${name}" is not set.`);
    }
    return value;
  }

  static get astraDbApplicationToken(): string {
    return this.ensureEnv('ASTRA_DB_APPLICATION_TOKEN');
  }

  static get astraDbKeyspace(): string {
    return this.ensureEnv('ASTRA_DB_NAMESPACE');
  }

  static get astraDbUrl(): string {
    return this.ensureEnv('ASTRA_DB_URL');
  }

  static get astraDbCollection(): string {
    return this.ensureEnv('ASTRA_DB_COLLECTION');
  }

  static get openAIKey(): string {
    console.log('OPEN_AI_KEY', process.env.OPEN_AI_KEY);
    return this.ensureEnv('OPEN_AI_KEY');
  }
}

export default Settings;
