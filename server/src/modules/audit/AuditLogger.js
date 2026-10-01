export class AuditLogger {
  log(action, userId) {
    return {
      action,
      userId,
      createdAt: new Date()
    };
  }
}