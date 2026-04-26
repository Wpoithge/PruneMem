import { RetrievalBackend } from './index.js';

export class QmdBackend extends RetrievalBackend {
  constructor(config = {}) {
    super();
    this.config = config;
  }
}
