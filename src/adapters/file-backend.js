import { RetrievalBackend } from './index.js';

export class FileBackend extends RetrievalBackend {
  constructor(config = {}) {
    super();
    this.config = config;
  }
}
