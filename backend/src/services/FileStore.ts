import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(__dirname, '../../data');

export class FileStore<T> {
  private readonly filePath: string;

  constructor(filename: string, private readonly defaultValue: T) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    this.filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(this.filePath)) {
      this.write(defaultValue);
    }
  }

  read(): T {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return this.defaultValue;
    }
  }

  write(data: T): void {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  update(mutator: (current: T) => T): T {
    const next = mutator(this.read());
    this.write(next);
    return next;
  }
}
