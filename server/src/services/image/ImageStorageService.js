export class ImageStorageService {
  constructor(provider = "local") {
    this.provider = provider;
  }

  getProvider() {
    return this.provider;
  }
}