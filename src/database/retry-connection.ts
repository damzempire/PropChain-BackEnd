import { DataSource } from 'typeorm';

export async function connectWithRetry(dataSource: DataSource, retries = 5, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await dataSource.initialize();
      console.log('Database connection established');
      return;
    } catch (err) {
      console.error(`DB connection failed (attempt ${i + 1}):`, err);
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw new Error('Database connection failed after retries');
      }
    }
  }
}
