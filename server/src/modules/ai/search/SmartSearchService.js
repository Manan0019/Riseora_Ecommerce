export class SmartSearchService {
  async search(query) {
    return {
      query,
      results: [],
      mode: "semantic-ready"
    };
  }
}